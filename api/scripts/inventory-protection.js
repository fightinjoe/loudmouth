#!/usr/bin/env node
'use strict';
// Read-only. Output contains operational IAM/account/hostname metadata, never secrets.
const { execFileSync } = require('node:child_process');
const project = process.env.GCP_PROJECT_ID;
const region = process.env.GCP_LOCATION;
if (!project || !region || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)) {
  console.error('Explicit GCP_PROJECT_ID and GCP_LOCATION are required; no hostname-derived project inference.');
  process.exit(1);
}
const inventory = { project, region, collectedAt: new Date().toISOString(), resources: {}, blockers: [] };
function metadata(value = {}) {
  return {
    name: value.name,
    namespace: value.namespace,
    labels: value.labels,
    annotations: Object.fromEntries(Object.entries(value.annotations || {}).filter(([key]) =>
      ['run.googleapis.com/ingress', 'run.googleapis.com/ingress-status', 'run.googleapis.com/invoker-iam-disabled', 'run.googleapis.com/urls'].includes(key))),
  };
}
function collect(name, args) {
  try {
    const output = execFileSync('gcloud', [...args, '--format=json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
    const value = JSON.parse(output);
    inventory.resources[name] = value;
    return value;
  } catch {
    inventory.blockers.push(`${name}: read failed; authenticate/authorize this explicit project and rerun. Absence is not established.`);
    return null;
  }
}
const accounts = collect('activeAccounts', ['auth', 'list', '--filter=status:ACTIVE']);
if (!accounts?.length) {
  inventory.blockers.push('No active gcloud account; live resource inventory was not attempted.');
} else {
  const projectFlag = `--project=${project}`, regionFlag = `--region=${region}`;
  collect('project', ['projects', 'describe', project]);
  collect('projectIam', ['projects', 'get-iam-policy', project]);
  const ancestors = collect('ancestors', ['projects', 'get-ancestors', project]);
  for (const ancestor of ancestors || []) {
    if (ancestor.type === 'folder') collect(`folderIam:${ancestor.id}`, ['resource-manager', 'folders', 'get-iam-policy', ancestor.id]);
    if (ancestor.type === 'organization') collect(`organizationIam:${ancestor.id}`, ['organizations', 'get-iam-policy', ancestor.id]);
  }
  const services = collect('runServices', ['run', 'services', 'list', projectFlag]);
  for (const service of services || []) {
    const name = service.metadata?.name;
    const location = service.metadata?.labels?.['cloud.googleapis.com/location'];
    if (!name || !location) { inventory.blockers.push('Cloud Run service missing location/name; inspect manually.'); continue; }
    // Full service specs can contain legacy plaintext environment secrets. Retain
    // only exposure metadata, service identity, and traffic, never container env.
    const described = collect(`runExposure:${location}:${name}`, ['run', 'services', 'describe', name, `--region=${location}`, projectFlag]);
    if (described) {
      const entries = Array.isArray(described) ? described : [described];
      inventory.resources[`runExposure:${location}:${name}`] = entries.map(entry => ({ metadata: metadata(entry.metadata), status: entry.status, serviceAccount: entry.spec?.template?.spec?.serviceAccountName }));
    }
    collect(`runIam:${location}:${name}`, ['run', 'services', 'get-iam-policy', name, `--region=${location}`, projectFlag]);
    const revisions = collect(`runRevisions:${location}:${name}`, ['run', 'revisions', 'list', `--service=${name}`, `--region=${location}`, projectFlag]);
    if (revisions) inventory.resources[`runRevisions:${location}:${name}`] = revisions.map(revision => ({ metadata: metadata(revision.metadata), status: revision.status, serviceAccount: revision.spec?.serviceAccountName }));
  }
  if (services) inventory.resources.runServices = services.map(service => ({ metadata: metadata(service.metadata), status: service.status, serviceAccount: service.spec?.template?.spec?.serviceAccountName }));
  collect('domainMappings', ['run', 'domain-mappings', 'list', regionFlag, projectFlag]);
  const gateways = collect('gateways', ['api-gateway', 'gateways', 'list', projectFlag]);
  for (const gateway of gateways || []) {
    const parts = gateway.name?.split('/');
    if (parts?.length === 6) collect(`gateway:${parts[5]}`, ['api-gateway', 'gateways', 'describe', parts[5], `--location=${parts[3]}`, projectFlag]);
  }
  const apis = collect('gatewayApis', ['api-gateway', 'apis', 'list', projectFlag]);
  for (const api of apis || []) {
    const apiId = api.name?.split('/').at(-1);
    const configs = collect(`apiConfigs:${apiId}`, ['api-gateway', 'api-configs', 'list', `--api=${apiId}`, projectFlag]);
    for (const config of configs || []) collect(`apiConfig:${apiId}:${config.name}`, ['api-gateway', 'api-configs', 'describe', config.name.split('/').at(-1), `--api=${apiId}`, '--view=FULL', projectFlag]);
  }
  const functions = collect('legacyFunctions', ['functions', 'list', projectFlag]);
  if (functions) inventory.resources.legacyFunctions = functions.map(fn => ({ name: fn.name, state: fn.state, status: fn.status, httpsTrigger: fn.httpsTrigger, serviceConfig: fn.serviceConfig && { uri: fn.serviceConfig.uri, serviceAccountEmail: fn.serviceConfig.serviceAccountEmail, ingressSettings: fn.serviceConfig.ingressSettings } }));
  collect('firestore', ['firestore', 'databases', 'list', projectFlag]);
  collect('enabledServices', ['services', 'list', '--enabled', projectFlag]);
  collect('billingLink', ['billing', 'projects', 'describe', project]);
  inventory.blockers.push('Manual console evidence required: Firebase apps/anonymous Auth, App Check registrations/TTL, reCAPTCHA domains/assessments, signup quotas, Apple signing, billing plan, notification delivery and named owners.');
  inventory.blockers.push('Review all returned IAM including inherited/custom roles, every traffic tag/default/custom hostname and legacy function/service. Unexplained invoker or alternate backend blocks release.');
}
console.log(JSON.stringify(inventory, null, 2));
if (inventory.blockers.length) process.exitCode = 1;
