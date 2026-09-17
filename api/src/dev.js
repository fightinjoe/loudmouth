const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');

const ENV_LOADED_FLAG = '--loudmouth-env-loaded';
const RESPONSE_DIRECTORY = join(__dirname, '..', 'tmp');
let lastCaptureTime = 0;

function captureResponse(req, res) {
  if (req.method !== 'POST') return;

  let captured = false;
  // Express json() delegates to send(); capture the original body only once.
  for (const method of ['json', 'send']) {
    const original = res[method];
    res[method] = function (body) {
      if (!captured) {
        captured = true;
        try {
          const timestamp = new Date().toISOString();
          // Keep filenames distinct even when concurrent responses share a millisecond.
          lastCaptureTime = Math.max(Date.now(), lastCaptureTime + 1);
          const filenameTime = new Date(lastCaptureTime).toISOString().replace(/:/g, '-');
          const endpoint = (req.path || '/').replace(/^\/+|\/+$/g, '')
            .replace(/[^a-zA-Z0-9_-]/g, '-') || 'root';
          mkdirSync(RESPONSE_DIRECTORY, { recursive: true, mode: 0o700 });
          writeFileSync(
            join(RESPONSE_DIRECTORY, `${filenameTime}-${endpoint}.json`),
            JSON.stringify({
              timestamp,
              method: req.method,
              path: req.path || '/',
              status: res.statusCode,
              body,
            }, null, 2) + '\n',
            { flag: 'wx', mode: 0o600 },
          );
        } catch (error) {
          console.error('Unable to save API response:', error.message);
        }
      }
      return original.call(this, body);
    };
  }
}

function readCliPort(args) {
  let value;
  let found = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--port') {
      if (found || index + 1 >= args.length) {
        throw new Error('--port must be provided once with a value');
      }
      found = true;
      value = args[index + 1];
      index += 1;
    } else if (argument.startsWith('--port=')) {
      if (found) {
        throw new Error('--port must be provided once with a value');
      }
      found = true;
      value = argument.slice('--port='.length);
    }
  }

  return found ? value : undefined;
}

function validatePort(value, source) {
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 65535) {
    throw new Error(`${source} must be an integer from 1 to 65535`);
  }
}

if (process.argv[2] === ENV_LOADED_FLAG) {
  process.argv.splice(2, 1);

  const cliPort = readCliPort(process.argv.slice(2));
  if (cliPort !== undefined) {
    validatePort(cliPort, '--port');
  } else if (process.env.PORT !== undefined) {
    validatePort(process.env.PORT, 'PORT');
  }

  process.env.FUNCTION_TARGET ??= 'translate';
  const api = require('./index');
  const translate = api.translate;
  api.translate = (req, res) => {
    captureResponse(req, res);
    return translate(req, res);
  };
  const frameworkMain = join(
    dirname(require.resolve('@google-cloud/functions-framework')),
    'main.js',
  );
  require(frameworkMain);
} else {
  const apiDirectory = resolve(__dirname, '..');
  const envFiles = ['.env', '.env.local']
    .map((name) => join(apiDirectory, name))
    .filter(existsSync);
  const envArguments = envFiles.map((file) => `--env-file=${file}`);
  const child = spawn(
    process.execPath,
    [...envArguments, __filename, ENV_LOADED_FLAG, ...process.argv.slice(2)],
    { env: process.env, stdio: 'inherit' },
  );

  child.on('error', (error) => {
    console.error(`Unable to start the API development server: ${error.message}`);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exitCode = code;
    }
  });
}
