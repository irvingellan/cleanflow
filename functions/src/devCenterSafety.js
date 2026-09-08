export function assertDevCenterMutationEnvironment(environment = process.env) {
  if (environment.FUNCTIONS_EMULATOR !== "true") {
    throw new Error("Dev Center mutations are available only in the Firebase emulator.");
  }
}
