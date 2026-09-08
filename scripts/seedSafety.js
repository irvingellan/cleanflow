const demoProjectId = "demo-cleanflow";

function localEmulatorHost(value) {
  const [host, port] = String(value || "").split(":");
  return ["127.0.0.1", "localhost"].includes(host) && /^\d+$/.test(port || "");
}

export function assertLocalDemoSeedEnvironment(environment = process.env) {
  if (environment.GCLOUD_PROJECT !== demoProjectId) {
    throw new Error(`Demo seeds require GCLOUD_PROJECT=${demoProjectId}.`);
  }
  if (!localEmulatorHost(environment.FIRESTORE_EMULATOR_HOST)) {
    throw new Error("Demo seeds require a local FIRESTORE_EMULATOR_HOST.");
  }
  return { projectId: demoProjectId, firestoreHost: environment.FIRESTORE_EMULATOR_HOST };
}
