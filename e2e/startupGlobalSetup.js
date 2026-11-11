import seedE2eFixtures from "./globalSetup.js";

// A fresh demo emulator with a verified synthetic manager, and no jobs. This
// exercises real core queries; CLEANFLOW_P0_STRESS=1 adds the downstream fan-out.
export default () => seedE2eFixtures({ managerOnly: true });
