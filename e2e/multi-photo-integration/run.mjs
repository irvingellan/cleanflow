import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const configPath = 'firebase.multiphoto-integration.json';
const { emulators } = JSON.parse(readFileSync(new URL(`../../${configPath}`, import.meta.url), 'utf8'));
const denied = '/nonexistent/cleanflow-multiphoto-e2e-no-credentials.json';
const secretFile = new URL('../../functions/.secret.local', import.meta.url);
const fixtures = 'DEV_CENTER_DEVELOPER_UIDS=synthetic-e2e-nonmember\nGITHUB_FEEDBACK_TOKEN=synthetic-e2e-disabled\n';
if (existsSync(denied)) throw new Error('Credential-denial path unexpectedly exists.');
writeFileSync(secretFile, fixtures, { flag: 'wx', mode: 0o600 });
let scratch;
try {
  scratch = mkdtempSync('/tmp/cf-multiphoto-');
  const env = {
    ...process.env,
    TMPDIR: scratch,
    FIREBASE_CLI_DISABLE_TELEMETRY: 'true',
    GOOGLE_APPLICATION_CREDENTIALS: denied,
    GCLOUD_PROJECT: 'demo-cleanflow',
    GOOGLE_CLOUD_PROJECT: 'demo-cleanflow',
    VITE_USE_FIREBASE_EMULATORS: 'true',
    ...Object.fromEntries(['auth', 'firestore', 'functions', 'storage'].map(name => [
      `VITE_CLEANFLOW_EMULATOR_${name.toUpperCase()}_PORT`, String(emulators[name].port),
    ])),
  };
  const run = (script, args) => {
    const result = spawnSync(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit', env });
    if (result.error) throw result.error;
    return result.status ?? 1;
  };
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
  const test = [
    process.execPath, 'node_modules/@playwright/test/cli.js', 'test',
    '--config=e2e/multi-photo-integration/playwright.config.js', ...process.argv.slice(2),
  ].map(quote).join(' ');
  process.exitCode = run('node_modules/vite/bin/vite.js', ['build', '--mode', 'emulator']);
  if (process.exitCode === 0) {
    process.exitCode = run('node_modules/firebase-tools/lib/bin/firebase.js', [
      'emulators:exec', '--config', configPath, '--project', 'demo-cleanflow',
      '--only', 'auth,firestore,storage,functions,hosting', '--log-verbosity', 'QUIET', test,
    ]);
  }
} finally {
  if (existsSync(secretFile) && readFileSync(secretFile, 'utf8') === fixtures) unlinkSync(secretFile);
  if (scratch) rmSync(scratch, { recursive: true, force: true });
}
