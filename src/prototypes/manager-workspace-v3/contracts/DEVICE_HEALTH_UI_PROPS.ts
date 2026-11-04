/**
 * Device health / notification readiness — UI contract (types only).
 * Status: PROPOSAL for Codex (issues #85, #84). Prototype source:
 *   hub/hubModel.js (deviceReadiness, evidenceLines), hub/DeviceHealth.jsx.
 *
 * Rule: the UI shows only what EVIDENCE supports. Permission granted is not a
 * registration; a registration is not delivery; provider-accepted is not display.
 * Never send push tokens, subscription endpoints or raw device ids to this UI.
 */

export type Platform = "ios" | "android" | "mac" | "windows" | "other";
/** From `matchMedia('(display-mode: standalone)')` / `navigator.standalone` in THIS window. */
export type DisplayMode = "browser" | "standalone" | "unknown";
/** From `Notification.permission` (or Permissions API) on THIS device. */
export type PermissionEvidence = "default" | "granted" | "denied" | "unknown";
/** Server-side record for this device/installation (Codex). */
export type RegistrationEvidence = "none" | "active" | "stale" | "error" | "unknown";
/** Service worker / app shell version vs the deployed one. */
export type AppVersionEvidence = "current" | "outdated" | "unknown";

export interface LocalStamp { date: string; min: number } // org-local date + minutes

export interface DeviceTestResult {
  /** confirmed = device receipt or the person said it appeared; accepted = provider accepted only. */
  result: "confirmed" | "accepted" | "failed";
  at: LocalStamp;
}

export interface DeviceEvidence {
  id: string;                    // opaque UI id, not a token
  owner: "manager" | string;     // manager or cleanerId (UI scoping only; server enforces)
  labelKey: string;              // i18n key, e.g. "dh.label.thisIphone"
  platform: Platform;
  browser?: string;
  displayMode: DisplayMode;
  permission: PermissionEvidence;
  registration: RegistrationEvidence;
  appVersion: AppVersionEvidence;
  supported: boolean;            // push capability of this platform/version
  lastActive: LocalStamp | null;
  lastTest: DeviceTestResult | null;
  lastConfirmed: LocalStamp | null;
  current?: boolean;             // this window's device
  other?: boolean;               // another person's device: show state only, no actions/details
  checking?: boolean;            // a check is in flight
}

export type ReadinessState = "ready" | "install" | "enable" | "reconnect" | "checking" | "unsupported" | "unknown";

export type ReadinessReason =
  | "noEvidence" | "iosTooOld" | "browserNoPush" | "iosNeedsHomeScreen" | "cantSeeInstall"
  | "permissionDenied" | "permissionNotAsked" | "permissionUnknown"
  | "registrationMissing" | "registrationError" | "registrationStale" | "appOutdated" | "registrationUnknown"
  | "testConfirmed" | "testFailed" | "acceptedNotConfirmed" | "registeredNotTested";

export type ReadinessAction = "install" | "allow" | "unblock" | "check" | "reconnect" | "update" | "test" | "inbox" | "support";

export interface Readiness { state: ReadinessState; reasons: ReadinessReason[]; action: ReadinessAction | null }

/** Pure function; port as-is (hub/hubModel.js deviceReadiness). Order of checks matters. */
export type DeviceReadinessFn = (ev: DeviceEvidence | null) => Readiness;

// ---------- Component props ----------

export interface ReadinessChipProps { device: DeviceEvidence; compact?: boolean }

export interface DeviceReadinessProps {
  device: DeviceEvidence;
  /** false for someone else's device: no actions. */
  mine?: boolean;
  showEvidence?: boolean;
  onInstall?: (platform: Platform) => void;
  onInbox?: () => void;
  /** Called when a test is requested; the UI then asks "did it appear?". */
  onTestBanner?: () => void;
}

export interface RecoveryFlowProps extends DeviceReadinessProps { onSupport?: () => void }

export interface DeviceListProps {
  devices: DeviceEvidence[];
  currentId?: string;
  onPick?: (id: string) => void;
  role?: "manager" | "cleaner";
}

// ---------- Functions Codex must provide (real, not simulated) ----------

export interface DeviceHealthService {
  /** Evidence for this window's device, computed client-side + server registration lookup. */
  getCurrentDeviceEvidence(): Promise<DeviceEvidence>;
  /** Devices the signed-in user may see (own; managers: other managers' state only). */
  listDevices(): Promise<DeviceEvidence[]>;
  /** Must follow a user gesture. Resolves with the browser's answer. */
  requestPermission(): Promise<PermissionEvidence>;
  /** Creates/refreshes THIS device's registration; never removes another device's. */
  reconnect(): Promise<RegistrationEvidence>;
  /** Sends a test to THIS device only; returns provider acceptance, never "displayed". */
  sendTest(): Promise<{ accepted: boolean; at: LocalStamp }>;
  /** Records the person's answer or a device receipt. */
  recordTestOutcome(result: DeviceTestResult["result"]): Promise<void>;
  /** Support code without personal data or tokens. */
  diagnosticsCode(): Promise<string>;
}
