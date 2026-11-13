'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

/**
 * Structured API logs. Each event is one JSON line so Cloud Run stores it as a
 * queryable `jsonPayload` (for example `jsonPayload.event="usage"`) with the
 * given severity, rather than one text entry per printed line. Events inside
 * `withRequest` carry that request's fields (its `requestId`), so per-request
 * and per-topic reports can group them.
 */
const requestContext = new AsyncLocalStorage();

function write(method, severity, fields) {
  console[method](JSON.stringify({ severity, ...requestContext.getStore(), ...fields }));
}

module.exports = {
  info: fields => write('log', 'INFO', fields),
  warn: fields => write('warn', 'WARNING', fields),
  error: fields => write('error', 'ERROR', fields),
  withRequest: (fields, callback) => requestContext.run(fields, callback),
};
