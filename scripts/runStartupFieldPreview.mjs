import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const script = fileURLToPath(import.meta.url);
const project = "demo-cleanflow";
const host = "127.0.0.1";
const previewPort = 4237;
const configPath = "firebase.cleaner-hub-test.json";
const config = JSON.parse(readFileSync(join(root, configPath), "utf8"));
const auth = config.emulators.auth;
const firestore = config.emulators.firestore;
if (auth.host !== host || firestore.host !== host) throw new Error("Field preview requires loopback emulators.");

function verifyBuild(directory, commit) {
  const build = JSON.parse(readFileSync(join(directory, "version.json"), "utf8"));
  if (!/^[a-f0-9]{40}$/.test(commit) || build.buildId !== commit
      || build.projectId !== project || build.environment !== "emulator") {
    throw new Error("Field preview must use the exact synthetic build.");
  }
}

async function serve(directory) {
  verifyBuild(directory, process.env.GITHUB_SHA);
  const { default: seed, requireLocalE2EEmulators } = await import("../e2e/globalSetup.js");
  requireLocalE2EEmulators();
  await seed();
  const { preview } = await import("vite");
  const policy = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' http://${host}:${auth.port} http://${host}:${firestore.port}`,
    "img-src 'self' data: blob:",
    "worker-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  await preview({
    root,
    mode: "emulator",
    build: { outDir: directory },
    preview: {
      host,
      port: previewPort,
      strictPort: true,
      headers: { "Content-Security-Policy": policy, "Referrer-Policy": "no-referrer" },
    },
  });
  console.log(`Field preview ready at http://${host}:${previewPort} (synthetic only).`);
}

function run(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, env, stdio: "inherit", detached: true });
    const interrupt = () => child.kill("SIGINT");
    const terminate = () => child.kill("SIGTERM");
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", terminate);
    child.once("close", (code) => {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
      resolve(code ?? 1);
    });
    child.once("error", reject);
  });
}

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

async function prepare() {
  if (Number(process.versions.node.split(".")[0]) !== 22) throw new Error("Use Node 22 for the field preview.");
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  if (git(["status", "--porcelain", "--untracked-files=normal"])) {
    throw new Error("Use a clean checkout so the preview marker identifies its source.");
  }
  const commit = git(["rev-parse", "HEAD"]);
  mkdirSync(join(root, ".tmp"), { recursive: true });
  const working = mkdtempSync(join(root, ".tmp", "startup-field-preview-"));
  const directory = join(working, "dist");
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("VITE_"))),
    GITHUB_SHA: commit,
    GOOGLE_APPLICATION_CREDENTIALS: join(working, "absent-credentials.json"),
    GCLOUD_PROJECT: project,
    GOOGLE_CLOUD_PROJECT: project,
    VITE_CLEANFLOW_ENV: "emulator",
    VITE_CLEANFLOW_PRIVATE_EMULATOR_ORIGIN: "",
    VITE_FIREBASE_PROJECT_ID: project,
    VITE_USE_FIREBASE_EMULATORS: "true",
    VITE_CLEANFLOW_EMULATOR_AUTH_PORT: String(auth.port),
    VITE_CLEANFLOW_EMULATOR_FIRESTORE_PORT: String(firestore.port),
  };
  try {
    const built = await run(["node_modules/vite/bin/vite.js", "build", "--mode", "emulator", "--outDir", directory], env);
    if (built !== 0) return built;
    verifyBuild(directory, commit);
    const command = [process.execPath, script, "--serve", directory].map(quote).join(" ");
    return await run([
      "node_modules/firebase-tools/lib/bin/firebase.js", "emulators:exec", "--config", configPath,
      "--project", project, "--only", "auth,firestore", command,
    ], env);
  } finally {
    rmSync(working, { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  process.exitCode = await prepare();
} else if (args.length === 2 && args[0] === "--serve") {
  await serve(args[1]);
} else {
  throw new Error("Run node scripts/runStartupFieldPreview.mjs without arguments.");
}
