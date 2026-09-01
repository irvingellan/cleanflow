import seedE2eFixtures from "../../e2e/globalSetup.js";

const emulatorEnvironment = {
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  GCLOUD_PROJECT: "demo-cleanflow",
};

for (const [name, expectedValue] of Object.entries(emulatorEnvironment)) {
  const existingValue = process.env[name];

  if (existingValue && existingValue !== expectedValue) {
    throw new Error(
      `Refusing to seed visual fixtures because ${name} is not the local demo emulator.`,
    );
  }

  process.env[name] = expectedValue;
}

await seedE2eFixtures();
console.log("Seeded deterministic E2E fixtures in local demo-cleanflow emulators.");
