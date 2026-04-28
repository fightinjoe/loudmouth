#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — override via environment variables if needed
# ---------------------------------------------------------------------------
PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID must be set}"
REGION="${GCP_LOCATION:-us-central1}"
SERVICE_NAME="translation-api"
SA_NAME="translation-api-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
API_ID="translation-api"
GATEWAY_ID="translation-api-gateway"
CONFIG_ID="translation-api-config-$(date +%Y%m%d-%H%M%S)"

echo "==> Project:  ${PROJECT_ID}"
echo "==> Region:   ${REGION}"

# ---------------------------------------------------------------------------
# 1. Enable required APIs
# ---------------------------------------------------------------------------
echo ""
echo "==> Enabling GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  apigateway.googleapis.com \
  secretmanager.googleapis.com \
  aiplatform.googleapis.com \
  --project="${PROJECT_ID}"

# ---------------------------------------------------------------------------
# 2. Create secrets if they don't exist
# ---------------------------------------------------------------------------
echo ""
echo "==> Checking secrets..."

for SECRET in anthropic-api-key openai-api-key; do
  if ! gcloud secrets describe "${SECRET}" --project="${PROJECT_ID}" &>/dev/null; then
    echo "    Creating secret: ${SECRET}"
    gcloud secrets create "${SECRET}" \
      --replication-policy="automatic" \
      --project="${PROJECT_ID}"
    echo ""
    echo "    *** ACTION REQUIRED ***"
    echo "    Secret '${SECRET}' was created but has no value."
    echo "    Add the API key with:"
    echo "    echo -n 'YOUR_KEY_HERE' | gcloud secrets versions add ${SECRET} --data-file=- --project=${PROJECT_ID}"
    echo ""
  else
    echo "    Secret already exists: ${SECRET}"
  fi
done

# ---------------------------------------------------------------------------
# 3. Create service account and grant roles
# ---------------------------------------------------------------------------
echo ""
echo "==> Checking service account..."

if ! gcloud iam service-accounts describe "${SA_EMAIL}" --project="${PROJECT_ID}" &>/dev/null; then
  echo "    Creating service account: ${SA_NAME}"
  gcloud iam service-accounts create "${SA_NAME}" \
    --display-name="Translation API Service Account" \
    --project="${PROJECT_ID}"
  echo "    Waiting for SA propagation..."
  sleep 10
else
  echo "    Service account already exists: ${SA_EMAIL}"
fi

echo "    Granting roles..."

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/aiplatform.user" \
  --condition=None \
  --quiet

for SECRET in anthropic-api-key openai-api-key; do
  gcloud secrets add-iam-policy-binding "${SECRET}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="${PROJECT_ID}"
done

gcloud run services add-iam-policy-binding "${SERVICE_NAME}" \
  --region="${REGION}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.invoker" \
  --project="${PROJECT_ID}"

# ---------------------------------------------------------------------------
# 4. Deploy Cloud Run function
# ---------------------------------------------------------------------------
echo ""
echo "==> Deploying Cloud Run function..."

gcloud run deploy "${SERVICE_NAME}" \
  --source="./src" \
  --function="translate" \
  --region="${REGION}" \
  --no-allow-unauthenticated \
  --service-account="${SA_EMAIL}" \
  --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID},GCP_LOCATION=${REGION}" \
  --set-secrets="ANTHROPIC_API_KEY=anthropic-api-key:latest,OPENAI_API_KEY=openai-api-key:latest" \
  --project="${PROJECT_ID}"

# ---------------------------------------------------------------------------
# 5. Capture Cloud Run URL and patch api-gateway.yaml
# ---------------------------------------------------------------------------
echo ""
echo "==> Fetching Cloud Run service URL..."

CLOUD_RUN_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format="value(status.url)")

echo "    Cloud Run URL: ${CLOUD_RUN_URL}"

PATCHED_YAML="$(mktemp).yaml"
sed "s|https://YOUR_CLOUD_RUN_URL|${CLOUD_RUN_URL}|g" config/api-gateway.yaml > "${PATCHED_YAML}"

echo "    Patched gateway config written to: ${PATCHED_YAML}"

# ---------------------------------------------------------------------------
# 6. Create or update API Gateway
# ---------------------------------------------------------------------------
echo ""
echo "==> Setting up API Gateway..."

# Create the API if it doesn't exist
if ! gcloud api-gateway apis describe "${API_ID}" --project="${PROJECT_ID}" &>/dev/null; then
  echo "    Creating API: ${API_ID}"
  gcloud api-gateway apis create "${API_ID}" \
    --project="${PROJECT_ID}"
else
  echo "    API already exists: ${API_ID}"
fi

# Create a new API config (always versioned by timestamp)
echo "    Creating API config: ${CONFIG_ID}"
gcloud api-gateway api-configs create "${CONFIG_ID}" \
  --api="${API_ID}" \
  --openapi-spec="${PATCHED_YAML}" \
  --backend-auth-service-account="${SA_EMAIL}" \
  --project="${PROJECT_ID}"

# Create or update the gateway
if ! gcloud api-gateway gateways describe "${GATEWAY_ID}" \
    --location="${REGION}" --project="${PROJECT_ID}" &>/dev/null; then
  echo "    Creating gateway: ${GATEWAY_ID}"
  gcloud api-gateway gateways create "${GATEWAY_ID}" \
    --api="${API_ID}" \
    --api-config="${CONFIG_ID}" \
    --location="${REGION}" \
    --project="${PROJECT_ID}"
else
  echo "    Updating gateway: ${GATEWAY_ID}"
  gcloud api-gateway gateways update "${GATEWAY_ID}" \
    --api="${API_ID}" \
    --api-config="${CONFIG_ID}" \
    --location="${REGION}" \
    --project="${PROJECT_ID}"
fi

# ---------------------------------------------------------------------------
# 7. Print gateway URL and test command
# ---------------------------------------------------------------------------
echo ""
echo "==> Fetching gateway URL..."

GATEWAY_URL=$(gcloud api-gateway gateways describe "${GATEWAY_ID}" \
  --location="${REGION}" \
  --project="${PROJECT_ID}" \
  --format="value(defaultHostname)")

echo ""
echo "====================================================="
echo " Deployment complete!"
echo "====================================================="
echo ""
echo " Gateway URL:  https://${GATEWAY_URL}"
echo ""
echo " Test command:"
echo ""
echo "   curl -X POST https://${GATEWAY_URL}/translate \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"text\": \"switch\", \"targetLanguage\": \"Japanese\", \"llm\": \"google\"}'"
echo ""
echo "====================================================="
