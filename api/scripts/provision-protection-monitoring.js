#!/usr/bin/env node
'use strict';
// Explicit operator command; no invocation occurs during deployment or startup.
const { execFileSync } = require('node:child_process');
const { configuration } = require('./deployment-config');
const env = process.env;
const requireValue = key => { if (!env[key]?.trim()) throw new Error(`${key} must be explicitly configured`); return env[key]; };
function gcloud(...args) { return execFileSync('gcloud', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim(); }
let token;
async function api(host, resource, method = 'GET', body) {
  token ||= gcloud('auth', 'print-access-token');
  const response = await fetch(`https://${host}/${resource}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${method} ${host}/${resource}: HTTP ${response.status}`);
  return response.status === 204 ? {} : response.json();
}
async function list(host, resource, field) {
  const values = []; let pageToken;
  do {
    const page = await api(host, resource + (pageToken ? `${resource.includes('?') ? '&' : '?'}pageToken=${encodeURIComponent(pageToken)}` : ''));
    values.push(...(page[field] || [])); pageToken = page.nextPageToken;
  } while (pageToken);
  return values;
}
async function main() {
  const config = configuration();
  const project = config.GCP_PROJECT_ID, region = config.GCP_LOCATION;
  const channel = requireValue('MONITOR_NOTIFICATION_CHANNEL');
  if (!channel.startsWith(`projects/${project}/notificationChannels/`)) throw new Error('Notification channel must belong to the explicit project');
  if (requireValue('MONITOR_CHANNEL_CONFIRMED') !== 'true') throw new Error('Confirm a received test notification before provisioning');
  const owners = ['BUDGET_OWNER', 'PRIVACY_OWNER', 'INCIDENT_OWNER'].map(requireValue);
  const image = requireValue('MONITOR_IMAGE');
  if (!/^[a-z0-9.-]+\/[a-zA-Z0-9_./-]+@sha256:[a-f0-9]{64}$/.test(image)) throw new Error('MONITOR_IMAGE must be an immutable, reviewed image digest');
  const billingAccount = requireValue('BILLING_ACCOUNT_ID');
  if (!/^[A-Z0-9]{6}-[A-Z0-9]{6}-[A-Z0-9]{6}$/.test(billingAccount)) throw new Error('Invalid BILLING_ACCOUNT_ID');
  const billingAmount = requireValue('BILLING_ALERT_USD');
  if (!/^[1-9]\d*$/.test(billingAmount)) throw new Error('BILLING_ALERT_USD must be an explicitly selected positive whole-dollar invoice alert');
  const projectNumber = gcloud('projects', 'describe', project, '--format=value(projectNumber)');
  gcloud('services', 'enable', 'monitoring.googleapis.com', 'logging.googleapis.com', 'cloudscheduler.googleapis.com', 'run.googleapis.com', 'cloudbillingbudgets.googleapis.com', `--project=${project}`);
  const configuredChannel = await api('monitoring.googleapis.com', `v3/${channel}`);
  if (configuredChannel.enabled === false || configuredChannel.verificationStatus === 'UNVERIFIED') throw new Error('Notification channel is disabled or unverified');
  if (configuredChannel.type !== 'email') throw new Error('The shared monitoring/billing notification channel must be email (Cloud Billing rejects other channel types)');
  const monitorName = 'translation-api-monitor', schedulerName = 'translation-api-scheduler';
  const monitor = `${monitorName}@${project}.iam.gserviceaccount.com`, scheduler = `${schedulerName}@${project}.iam.gserviceaccount.com`;
  const accounts = JSON.parse(gcloud('iam', 'service-accounts', 'list', `--project=${project}`, '--format=json'));
  for (const name of [monitorName, schedulerName]) {
    if (!accounts.some(account => account.email === `${name}@${project}.iam.gserviceaccount.com`)) gcloud('iam', 'service-accounts', 'create', name, `--project=${project}`);
  }
  gcloud('projects', 'add-iam-policy-binding', project, `--member=serviceAccount:${monitor}`, '--role=roles/datastore.viewer', '--condition=None', '--quiet');
  const monitorEnv = ['GCP_PROJECT_ID', 'FIREBASE_PROJECT_ID', 'PROTECTION_ENV', 'PRICING_VERIFIED_AT',
    'IMAGE_RESERVE_MICROS', 'LLM_BACKEND', 'PHRASEBOOK_GENERATION_BACKEND']
    .filter(key => config[key] !== undefined).map(key => `${key}=${config[key]}`).join(',');
  gcloud('run', 'jobs', 'deploy', monitorName, `--project=${project}`, `--region=${region}`, `--image=${image}`, `--service-account=${monitor}`, `--set-env-vars=${monitorEnv}`, '--command=node', '--args=/workspace/scripts/protection-admin.js,status,--monitor', '--tasks=1', '--parallelism=1', '--max-retries=0', '--task-timeout=50s', '--memory=512Mi', '--cpu=1', '--quiet');
  gcloud('run', 'jobs', 'add-iam-policy-binding', monitorName, `--project=${project}`, `--region=${region}`, `--member=serviceAccount:${scheduler}`, '--role=roles/run.invoker', '--condition=None');
  const schedulers = JSON.parse(gcloud('scheduler', 'jobs', 'list', `--project=${project}`, `--location=${region}`, '--format=json'));
  const schedulerExists = schedulers.some(job => job.name.endsWith(`/${monitorName}`));
  gcloud('scheduler', 'jobs', schedulerExists ? 'update' : 'create', 'http', monitorName, `--project=${project}`, `--location=${region}`, '--schedule=* * * * *', '--time-zone=Etc/UTC', `--uri=https://run.googleapis.com/v2/projects/${project}/locations/${region}/jobs/${monitorName}:run`, '--http-method=POST', `--oauth-service-account-email=${scheduler}`, '--oauth-token-scope=https://www.googleapis.com/auth/cloud-platform', '--message-body={}', '--attempt-deadline=30s', '--max-retry-attempts=0');

  // Only the dedicated API/monitor logs are routed to the 30-day operations bucket.
  // The operator must audit other sinks; a second sink may retain another copy.
  const buckets = JSON.parse(gcloud('logging', 'buckets', 'list', '--location=global', `--project=${project}`, '--format=json'));
  const bucketExists = buckets.some(bucket => bucket.name.endsWith('/api-protection'));
  gcloud('logging', 'buckets', bucketExists ? 'update' : 'create', 'api-protection', '--location=global', '--retention-days=30', `--project=${project}`);
  const sourceFilter = '(resource.type="cloud_run_revision" AND resource.labels.service_name="translation-api") OR (resource.type="cloud_run_job" AND resource.labels.job_name="translation-api-monitor") OR resource.type="apigateway.googleapis.com/Gateway"';
  const sinks = JSON.parse(gcloud('logging', 'sinks', 'list', `--project=${project}`, '--format=json'));
  gcloud('logging', 'sinks', sinks.some(sink => sink.name === 'api-protection') ? 'update' : 'create', 'api-protection', `logging.googleapis.com/projects/${project}/locations/global/buckets/api-protection`, `--log-filter=${sourceFilter}`, `--project=${project}`);
  // The same-project Logging bucket does not require a cross-project sink grant.
  const metricRoot = `v2/projects/${project}/metrics`;
  const metrics = await list('logging.googleapis.com', metricRoot, 'metrics');
  const definitions = [
    ['admission', 'jsonPayload.event="admission_outcome"', 'Admission outcomes; sampled auth failures are estimates, not exact request counts.'],
    ['identity_rejected_sampled', 'jsonPayload.event="admission_outcome" AND jsonPayload.code="AUTH_REQUIRED"', 'One-percent sampled backend identity rejections; use gateway/platform counters for exact totals.'],
    ['app_rejected_sampled', 'jsonPayload.event="admission_outcome" AND jsonPayload.code="APP_VERIFICATION_FAILED"', 'One-percent sampled App Check rejections.'],
    ['caller_rejected', 'jsonPayload.event="admission_outcome" AND (jsonPayload.code="CALLER_QUOTA" OR jsonPayload.code="CALLER_CONCURRENCY")', 'Caller admission rejections.'],
    ['global_rejected', 'jsonPayload.event="admission_outcome" AND (jsonPayload.code="GLOBAL_BUDGET" OR jsonPayload.code="GLOBAL_CAPACITY" OR jsonPayload.code="GENERATION_PAUSED")', 'Global admission rejections.'],
    ['accepted', 'jsonPayload.event="admission_outcome" AND jsonPayload.outcome="accepted"', 'Accepted reservations.'],
    ['ledger_failure', 'jsonPayload.code="ADMISSION_UNAVAILABLE" OR jsonPayload.outcome="ADMISSION_UNAVAILABLE" OR jsonPayload.event="protection_monitor_failure" OR (jsonPayload.event="reservation_outcome" AND jsonPayload.outcome="settlement_failed")', 'Admission, settlement and monitor ledger failures.'],
    ['provider_failure', 'jsonPayload.event="admission_outcome" AND jsonPayload.outcome="provider_failed"', 'Failed provider-backed requests.'],
    ['gateway_401', 'resource.type="apigateway.googleapis.com/Gateway" AND httpRequest.status=401', 'Gateway request-log identity rejections; verify request-log completeness before treating as exact.'],
    ['monitor_heartbeat', 'jsonPayload.event="protection_monitor"', 'Successful minute monitor observations.'],
  ].map(([suffix, filter, description]) => ({ name: `protection_${suffix}`, description, filter: `(${sourceFilter}) AND (${filter})`, metricDescriptor: { metricKind: 'DELTA', valueType: 'INT64', unit: '1' } }));
  for (const field of ['dailyReservedMicros', 'dailySettledMicros', 'monthlyReservedMicros', 'monthlySettledMicros', 'activeReservations', 'uncertainReservations', 'staleReservations', 'dailyUtilization', 'monthlyUtilization']) {
    definitions.push({ name: `protection_${field}`, description: `Minute monitor ${field}; sampled distribution, not a live transactional gauge.`, filter: `resource.type="cloud_run_job" AND resource.labels.job_name="${monitorName}" AND jsonPayload.event="protection_monitor"`, metricDescriptor: { metricKind: 'DELTA', valueType: 'DISTRIBUTION', unit: field.endsWith('Micros') ? '1' : '1' }, valueExtractor: `EXTRACT(jsonPayload.${field})`, bucketOptions: { exponentialBuckets: { numFiniteBuckets: 64, growthFactor: 1.5, scale: 0.01 } } });
  }
  for (const metric of definitions) await api('logging.googleapis.com', metrics.some(old => old.name === metric.name) ? `${metricRoot}/${metric.name}` : metricRoot, metrics.some(old => old.name === metric.name) ? 'PUT' : 'POST', metric);
  const policyRoot = `v3/projects/${project}/alertPolicies`;
  const policies = await list('monitoring.googleapis.com', policyRoot, 'alertPolicies');
  const alertDefinitions = [
    ['Daily admission 50%', 'jsonPayload.event="protection_monitor" AND jsonPayload.dailyUtilization>=0.5'],
    ['Daily admission 80%', 'jsonPayload.event="protection_monitor" AND jsonPayload.dailyUtilization>=0.8'],
    ['Monthly admission 50%', 'jsonPayload.event="protection_monitor" AND jsonPayload.monthlyUtilization>=0.5'],
    ['Monthly admission 80%', 'jsonPayload.event="protection_monitor" AND jsonPayload.monthlyUtilization>=0.8'],
    ['Reservation overshoot', '(jsonPayload.event="protection_monitor" OR jsonPayload.event="reservation_outcome") AND jsonPayload.overshoot=true'],
    ['Stale uncertain capacity', 'jsonPayload.event="protection_monitor" AND jsonPayload.staleReservations>0'],
    ['Ledger failure', 'jsonPayload.code="ADMISSION_UNAVAILABLE" OR jsonPayload.outcome="ADMISSION_UNAVAILABLE" OR jsonPayload.event="protection_monitor_failure" OR (jsonPayload.event="reservation_outcome" AND jsonPayload.outcome="settlement_failed")'],
  ].map(([title, filter]) => ({ displayName: `API protection: ${title}`, conditions: [{ displayName: title, conditionMatchedLog: { filter: `(${sourceFilter}) AND (${filter})` } }], alertStrategy: { notificationRateLimit: { period: '300s' }, autoClose: '1800s' } }));
  alertDefinitions.push({ displayName: 'API protection: Monitor missing', conditions: [{ displayName: 'No successful monitor observation in five minutes', conditionAbsent: { filter: 'metric.type="logging.googleapis.com/user/protection_monitor_heartbeat" AND resource.type="cloud_run_job"', duration: '300s', aggregations: [{ alignmentPeriod: '60s', perSeriesAligner: 'ALIGN_SUM', crossSeriesReducer: 'REDUCE_SUM' }], trigger: { count: 1 } } }], alertStrategy: { autoClose: '1800s' } });
  for (const definition of alertDefinitions) {
    const previous = policies.find(policy => policy.displayName === definition.displayName);
    const policy = { ...definition, combiner: 'OR', enabled: true, notificationChannels: [channel], documentation: { mimeType: 'text/markdown', content: `Pause admission with operator CLI; never disable authentication or refund unknown work. Owners (budget/privacy/incident): ${owners.join(' / ')}. See repository docs/api/operations.md (Control and recovery).` } };
    if (previous) policy.name = previous.name;
    await api('monitoring.googleapis.com', previous ? `v3/${previous.name}` : policyRoot, previous ? 'PATCH' : 'POST', policy);
  }
  const dashboardRoot = `v1/projects/${project}/dashboards`;
  const dashboards = await list('monitoring.googleapis.com', dashboardRoot, 'dashboards');
  const oldDashboard = dashboards.find(dashboard => dashboard.displayName === 'API protection baseline');
  const dashboard = { displayName: 'API protection baseline', gridLayout: { columns: '2', widgets: definitions.map(metric => ({ title: metric.description, xyChart: { dataSets: [{ timeSeriesQuery: { timeSeriesFilter: { filter: `metric.type="logging.googleapis.com/user/${metric.name}"`, aggregation: { alignmentPeriod: '60s', perSeriesAligner: metric.valueExtractor ? 'ALIGN_PERCENTILE_99' : 'ALIGN_SUM' } } }, plotType: 'LINE' }] } })) } };
  if (oldDashboard) { dashboard.name = oldDashboard.name; dashboard.etag = oldDashboard.etag; }
  await api('monitoring.googleapis.com', oldDashboard ? `v1/${oldDashboard.name}` : dashboardRoot, oldDashboard ? 'PATCH' : 'POST', dashboard);
  const budgetRoot = `v1/billingAccounts/${billingAccount}/budgets`;
  const budgets = await list('billingbudgets.googleapis.com', budgetRoot, 'budgets');
  const oldBudget = budgets.find(budget => budget.displayName === `API cloud invoice ${project}`);
  if (oldBudget?.spendCap) throw new Error('Refusing to overwrite an existing spend-cap budget; select/review a separate alert-only budget');
  const budget = { displayName: `API cloud invoice ${project}`, budgetFilter: { projects: [`projects/${projectNumber}`], calendarPeriod: 'MONTH' }, amount: { specifiedAmount: { currencyCode: 'USD', units: billingAmount } }, thresholdRules: [{ thresholdPercent: 0.5 }, { thresholdPercent: 0.8 }, { thresholdPercent: 1 }], notificationsRule: { monitoringNotificationChannels: [channel] } };
  if (oldBudget) { budget.name = oldBudget.name; budget.etag = oldBudget.etag; }
  await api('billingbudgets.googleapis.com', oldBudget ? `v1/${oldBudget.name}` : budgetRoot, oldBudget ? 'PATCH' : 'POST', budget);
  console.log('Monitoring provisioned; no admission counters or enabled state changed. Confirm alert delivery and complete the protected 48-hour staging gate before resume.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
