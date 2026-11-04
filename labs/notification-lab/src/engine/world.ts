// Fictitious starting world. Names, properties and devices are invented.
import { zonedToEpoch } from "./clock.ts";
import type { Device, Job, LabSettings, Offer, User, World } from "./types.ts";

export const ORG = "org-demo";
export const OTHER_ORG = "org-outra";
export const BASE_DATE = "2026-11-04";
export const BASE_TIME = "09:00";
export const DEFAULT_TZ = "America/Los_Angeles";

export const DEFAULT_SETTINGS: LabSettings = {
  timeZone: DEFAULT_TZ,
  quietStart: "21:00",
  quietEnd: "07:00",
  reminderLeadHours: 2,
  dayBeforeHour: "18:00",
  channel: "push",
};

function users(): Record<string, User> {
  const list: User[] = [
    { id: "gabi", role: "MANAGER", orgId: ORG, active: true, locale: "pt", displayName: "Gabi" },
    { id: "ana", role: "CLEANER", orgId: ORG, active: true, locale: "pt", displayName: "Ana" },
    { id: "bia", role: "CLEANER", orgId: ORG, active: true, locale: "es", displayName: "Bia" },
    { id: "carla", role: "CLEANER", orgId: ORG, active: true, locale: "en", displayName: "Carla" },
    { id: "dora", role: "CLEANER", orgId: OTHER_ORG, active: true, locale: "pt", displayName: "Dora" },
  ];
  return Object.fromEntries(list.map((u) => [u.id, u]));
}

function device(partial: Partial<Device> & Pick<Device, "id" | "userId" | "label" | "platform" | "browser">): Device {
  return {
    signedInUserId: partial.userId,
    installed: true,
    standalone: true,
    permission: "granted",
    subscription: "active",
    online: true,
    foreground: false,
    providerMode: "accepted",
    lastSyncSeq: 0,
    lastSyncAt: 0,
    visible: true,
    ...partial,
  };
}

function devices(): Record<string, Device> {
  const list: Device[] = [
    device({ id: "gabi-iphone", userId: "gabi", label: "iPhone da Gabi", platform: "ios", browser: "Safari · PWA" }),
    device({ id: "ana-iphone", userId: "ana", label: "iPhone da Ana", platform: "ios", browser: "Safari · PWA" }),
    device({ id: "bia-android", userId: "bia", label: "Android da Bia", platform: "android", browser: "Chrome · PWA" }),
    device({
      id: "carla-iphone",
      userId: "carla",
      label: "iPhone da Carla",
      platform: "ios",
      browser: "Safari · aba",
      installed: false,
      standalone: false,
      permission: "default",
      subscription: "missing",
    }),
    device({ id: "gabi-ipad", userId: "gabi", label: "iPad da Gabi", platform: "ios", browser: "Safari · PWA", visible: false }),
    device({ id: "dora-android", userId: "dora", label: "Android da Dora", platform: "android", browser: "Chrome · PWA" }),
  ];
  return Object.fromEntries(list.map((d) => [d.id, d]));
}

function job(partial: Partial<Job> & Pick<Job, "id" | "propertyName" | "date" | "start">): Job {
  return {
    orgId: ORG,
    status: "UNASSIGNED",
    assignedCleanerId: null,
    offerMode: "MANUAL",
    revision: 1,
    archived: false,
    checklist: "NONE",
    attendanceConfirmed: [],
    ...partial,
  };
}

function jobs(): Record<string, Job> {
  const list: Job[] = [
    job({ id: "job-maple", propertyName: "Casa Maple", date: "2026-11-05", start: "10:00" }),
    job({ id: "job-birch", propertyName: "Apto Birch", date: "2026-11-05", start: "14:00", status: "ASSIGNED", assignedCleanerId: "ana" }),
    job({ id: "job-cedar", propertyName: "Loft Cedar", date: "2026-11-04", start: "11:00", status: "ASSIGNED", assignedCleanerId: "bia" }),
    job({ id: "job-dune", propertyName: "Chalé Dune", date: "2026-11-06", start: "09:30" }),
    job({ id: "job-outra", orgId: OTHER_ORG, propertyName: "Casa Outra Org", date: "2026-11-05", start: "08:00", status: "ASSIGNED", assignedCleanerId: "dora" }),
  ];
  return Object.fromEntries(list.map((j) => [j.id, j]));
}

export interface Preconditions {
  clock?: { date: string; time: string };
  settings?: Partial<LabSettings>;
  users?: Record<string, Partial<User>>;
  devices?: Record<string, Partial<Device>>;
  jobs?: Record<string, Partial<Job>>;
  offers?: Array<Omit<Offer, "validUntil" | "amount"> & Partial<Pick<Offer, "validUntil" | "amount">>>;
}

export function createWorld(seed: number, pre: Preconditions = {}): World {
  const settings = { ...DEFAULT_SETTINGS, ...pre.settings };
  const clockAt = pre.clock ?? { date: BASE_DATE, time: BASE_TIME };
  const clock = zonedToEpoch(clockAt.date, clockAt.time, settings.timeZone);
  const world: World = {
    seed,
    rngState: seed >>> 0,
    clock,
    seq: 0,
    counters: {},
    settings,
    orgs: { [ORG]: { id: ORG, name: "CleanFlow Demo" }, [OTHER_ORG]: { id: OTHER_ORG, name: "Outra Org Demo" } },
    users: users(),
    devices: devices(),
    jobs: jobs(),
    offers: {},
    events: [],
    inbox: [],
    attempts: [],
    timeline: [],
    idempotencyKeys: [],
    queue: [],
    openContext: {},
  };
  for (const [id, patch] of Object.entries(pre.users ?? {})) world.users[id] = { ...world.users[id]!, ...patch };
  for (const [id, patch] of Object.entries(pre.devices ?? {})) world.devices[id] = { ...world.devices[id]!, ...patch };
  for (const [id, patch] of Object.entries(pre.jobs ?? {})) world.jobs[id] = { ...world.jobs[id]!, ...patch };
  for (const offer of pre.offers ?? []) {
    world.offers[offer.id] = { validUntil: clock + 24 * 3600_000, amount: 120, ...offer };
  }
  for (const d of Object.values(world.devices)) d.lastSyncAt = clock;
  for (const id of Object.keys(world.devices)) world.openContext[id] = null;
  return world;
}
