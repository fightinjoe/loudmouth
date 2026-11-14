// Shared reader and Markdown helpers for reports over the API's single-line JSON log events (api/src/log.js).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Common CLI options for log reports; spread into parseArgs `options`.
export const logSourceOptions = {
  project: { type: 'string', default: process.env.GCP_PROJECT_ID },
  service: { type: 'string', default: 'translation-api' },
  file: { type: 'string' },
};

// Reads events oldest first: from --file (one JSON event per line, other lines skipped) or from
// `gcloud logging read` against the Cloud Run service over the last `since` (a gcloud freshness such as 7d).
export function readEvents({ file, project, service, since }) {
  if (file) {
    return readFileSync(file, 'utf8').split('\n').flatMap(line => {
      try {
        const value = JSON.parse(line);
        return value && typeof value === 'object' && typeof value.event === 'string' ? [value] : [];
      } catch {
        return [];
      }
    });
  }
  if (!project) throw new Error('Set --project or GCP_PROJECT_ID, or pass --file');
  const filter = `resource.type="cloud_run_revision" AND resource.labels.service_name="${service}" AND jsonPayload.event:*`;
  const output = execFileSync('gcloud', [
    'logging', 'read', filter, `--project=${project}`, `--freshness=${since}`, '--format=json', '--limit=100000',
  ], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });
  return JSON.parse(output).map(entry => entry.jsonPayload).reverse();
}

export const sourceLine = ({ file, service, since }) => (file ? `Source: \`${file}\`` : `Source: Cloud Logging, service \`${service}\`, last ${since}`);

export const percentile = (values, p) => {
  if (values.length === 0) return '–';
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
};

export const table = (header, rows) => [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map(row => `| ${row.join(' | ')} |`)].join('\n');
