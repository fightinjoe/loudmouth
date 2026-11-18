#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# This script mutates the explicitly selected project. It never enables admission.
node scripts/deployment-config.js validate
PROJECT_ID="${GCP_PROJECT_ID:?}"
REGION="${GCP_LOCATION:-us-central1}"
RUNTIME="translation-api-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
GATEWAY="translation-api-gateway@${PROJECT_ID}.iam.gserviceaccount.com"
SERVICE_NAME=translation-api
API_ID=translation-api
GATEWAY_ID=translation-api-gateway
CONFIG_ID="translation-api-config-$(date -u +%Y%m%d-%H%M%S)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
node scripts/deployment-config.js env "$TMP_DIR/env.json"

# A failed describe is not evidence that a resource is absent. Lists must succeed.
gcloud auth list --filter=status:ACTIVE --format='value(account)' > "$TMP_DIR/account"
[[ -s "$TMP_DIR/account" ]] || { echo 'An explicitly authenticated gcloud operator is required' >&2; exit 1; }
# The database is deliberately not created here: its region is an owner decision.
DB_LOCATION="$(gcloud firestore databases describe --database='(default)' --project="$PROJECT_ID" --format='value(locationId)')"
[[ "$DB_LOCATION" == "$FIRESTORE_LOCATION" ]] || { echo 'Firestore location differs from the approved FIRESTORE_LOCATION' >&2; exit 1; }
node scripts/protection-admin.js status > "$TMP_DIR/control-status.json"
node -e 'const fs=require("fs"),status=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(status.enabled!==false){console.error("Pause generation with operator credentials before deployment");process.exit(1)}' "$TMP_DIR/control-status.json"

gcloud services enable run.googleapis.com apigateway.googleapis.com servicemanagement.googleapis.com servicecontrol.googleapis.com secretmanager.googleapis.com aiplatform.googleapis.com firestore.googleapis.com firebaseappcheck.googleapis.com identitytoolkit.googleapis.com --project="$PROJECT_ID"
gcloud iam service-accounts list --project="$PROJECT_ID" --format='value(email)' > "$TMP_DIR/accounts"
for ACCOUNT in translation-api-runtime translation-api-gateway; do
  if ! node -e 'const fs=require("fs");process.exit(fs.readFileSync(process.argv[1],"utf8").split(/\s+/).includes(process.argv[2])?0:1)' "$TMP_DIR/accounts" "${ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com"; then
    gcloud iam service-accounts create "$ACCOUNT" --project="$PROJECT_ID"
  fi
done
for ROLE in roles/aiplatform.user roles/datastore.user; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$RUNTIME" --role="$ROLE" --condition=None --quiet
done

# Grant only selected provider secrets. Image always uses OpenRouter; missing image
# pricing independently disables its admission. Never create empty secret versions.
SECRETS=''
SECRET_NAMES=()
if [[ "${PHRASEBOOK_GENERATION_BACKEND:-deepseek-v4.1-flash}" == deepseek-v4.1-flash || -n "${IMAGE_RESERVE_MICROS:-}" ]]; then
  SECRET_NAMES+=(openrouter-api-key)
  SECRETS='OPENROUTER_API_KEY=openrouter-api-key:latest'
fi
case "${LLM_BACKEND:-gemini-3.5-flash-lite}" in
  claude) SECRET_NAMES+=(anthropic-api-key); SECRETS+="${SECRETS:+,}ANTHROPIC_API_KEY=anthropic-api-key:latest" ;;
  chatgpt) SECRET_NAMES+=(openai-api-key); SECRETS+="${SECRETS:+,}OPENAI_API_KEY=openai-api-key:latest" ;;
esac
SECRET_ARGS=(--clear-secrets)
if [[ -n "$SECRETS" ]]; then SECRET_ARGS=("--set-secrets=$SECRETS"); fi
for SECRET in ${SECRET_NAMES[*]:-}; do
  gcloud secrets versions describe latest --secret="$SECRET" --project="$PROJECT_ID" --format='value(state)' > "$TMP_DIR/secret-state"
  [[ "$(cat "$TMP_DIR/secret-state")" == ENABLED ]] || { echo "Provision enabled secret version: $SECRET" >&2; exit 1; }
  gcloud secrets add-iam-policy-binding "$SECRET" --member="serviceAccount:$RUNTIME" --role=roles/secretmanager.secretAccessor --project="$PROJECT_ID" --condition=None
done
# Remove runtime grants left by a previous provider selection (never other identities).
for SECRET in anthropic-api-key openai-api-key openrouter-api-key; do
  if [[ ",${SECRETS}," != *"=${SECRET}:latest,"* ]]; then
    gcloud secrets list --project="$PROJECT_ID" --filter="name:$SECRET" --format='value(name)' > "$TMP_DIR/secret-name"
    if [[ -s "$TMP_DIR/secret-name" ]]; then
      gcloud secrets get-iam-policy "$SECRET" --project="$PROJECT_ID" --format=json > "$TMP_DIR/secret-policy.json"
      if node -e 'const p=require(process.argv[1]);process.exit((p.bindings||[]).some(b=>b.role==="roles/secretmanager.secretAccessor"&&!b.condition&&(b.members||[]).includes(process.argv[2]))?0:1)' "$TMP_DIR/secret-policy.json" "serviceAccount:$RUNTIME"; then
        gcloud secrets remove-iam-policy-binding "$SECRET" --project="$PROJECT_ID" --member="serviceAccount:$RUNTIME" --role=roles/secretmanager.secretAccessor --condition=None
      fi
    fi
  fi
done

# Deploy before binding invoker: the service need not exist on first installation.
# Public ingress is intentional for API Gateway; authenticated IAM is mandatory.
gcloud run deploy "$SERVICE_NAME" --source=./src --function=translate --base-image=nodejs24 \
  --region="$REGION" --project="$PROJECT_ID" --service-account="$RUNTIME" \
  --no-allow-unauthenticated --invoker-iam-check --ingress=all --timeout=300s \
  --env-vars-file="$TMP_DIR/env.json" "${SECRET_ARGS[@]}"
gcloud run services get-iam-policy "$SERVICE_NAME" --region="$REGION" --project="$PROJECT_ID" --format=json > "$TMP_DIR/service-policy.json"
# Remove public members across all service bindings, retaining reviewed operators.
node -e 'const fs=require("fs"),p=JSON.parse(fs.readFileSync(process.argv[1]));p.bindings=(p.bindings||[]).map(b=>({...b,members:b.members.filter(m=>m!=="allUsers"&&m!=="allAuthenticatedUsers")})).filter(b=>b.members.length);fs.writeFileSync(process.argv[1],JSON.stringify(p))' "$TMP_DIR/service-policy.json"
gcloud run services set-iam-policy "$SERVICE_NAME" "$TMP_DIR/service-policy.json" --region="$REGION" --project="$PROJECT_ID"
gcloud run services add-iam-policy-binding "$SERVICE_NAME" --region="$REGION" --project="$PROJECT_ID" --member="serviceAccount:$GATEWAY" --role=roles/run.invoker --condition=None

# Deny client Firestore access; runtime/Admin SDKs use ADC and IAM instead.
(cd src && npx --no-install firebase deploy --only firestore:rules --config ../firebase.json --project "$PROJECT_ID" --non-interactive)
for COLLECTION in protectionCallers protectionReservations protectionBudgets; do
  gcloud firestore fields ttls update deleteAfter --collection-group="$COLLECTION" --database='(default)' --enable-ttl --project="$PROJECT_ID" --quiet
done

CLOUD_RUN_URL="$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --project="$PROJECT_ID" --format='value(status.url)')"
node scripts/deployment-config.js gateway "$CLOUD_RUN_URL" "$TMP_DIR/gateway.yaml"
gcloud api-gateway apis list --project="$PROJECT_ID" --format='value(name)' > "$TMP_DIR/apis"
if ! node -e 'const fs=require("fs");process.exit(fs.readFileSync(process.argv[1],"utf8").split(/\s+/).some(n=>n.endsWith("/"+process.argv[2]))?0:1)' "$TMP_DIR/apis" "$API_ID"; then
  gcloud api-gateway apis create "$API_ID" --project="$PROJECT_ID"
fi
gcloud api-gateway api-configs create "$CONFIG_ID" --api="$API_ID" --openapi-spec="$TMP_DIR/gateway.yaml" --backend-auth-service-account="$GATEWAY" --project="$PROJECT_ID"
gcloud api-gateway gateways list --location="$REGION" --project="$PROJECT_ID" --format='value(name)' > "$TMP_DIR/gateways"
GATEWAY_ACTION=create
if node -e 'const fs=require("fs");process.exit(fs.readFileSync(process.argv[1],"utf8").split(/\s+/).some(n=>n.endsWith("/"+process.argv[2]))?0:1)' "$TMP_DIR/gateways" "$GATEWAY_ID"; then GATEWAY_ACTION=update; fi
gcloud api-gateway gateways "$GATEWAY_ACTION" "$GATEWAY_ID" --api="$API_ID" --api-config="$CONFIG_ID" --location="$REGION" --project="$PROJECT_ID"
gcloud api-gateway gateways describe "$GATEWAY_ID" --location="$REGION" --project="$PROJECT_ID" --format='value(defaultHostname)'
printf '%s\n' 'Deployment finished; admission control was NOT initialized, resumed, or reset.' \
  'Complete alternate-hostname/inherited-IAM checks, monitor provisioning and coordinated release gates in docs/api/operations.md before operator resume.' \
  'Authenticated smoke tests obtain Firebase ID and App Check tokens in SDK memory; an unauthenticated POST must fail.'
