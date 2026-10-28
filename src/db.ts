import Dexie, { type EntityTable } from "dexie";
import { backend } from "./lib/config";
import type { Activity, Entry, Focus, Deload, Injury, Place, Settings, Synced, TableName, Tables } from "./types";

// Server mode keeps its cache apart from anything logged locally before the server existed.
export const db = new Dexie(backend ? "training-cloud" : "training") as Dexie & {
  entries: EntityTable<Entry, "id">;
  places: EntityTable<Place, "id">;
  focuses: EntityTable<Focus, "id">;
  deloads: EntityTable<Deload, "id">;
  injuries: EntityTable<Injury, "id">;
  settings: EntityTable<Settings, "id">;
};

db.version(1).stores({
  entries: "id, date, dirty",
  places: "id, dirty",
  focuses: "id, dirty",
  deloads: "id, startDate, dirty",
  injuries: "id, date, dirty",
  settings: "id, dirty",
});

export const newId = () => crypto.randomUUID();

export const table = <T extends TableName>(name: T) => db.table<Tables[T], string>(name);

// Listeners for local changes, so sync can push them soon after.
const changeListeners = new Set<() => void>();
export const onLocalChange = (l: () => void) => {
  changeListeners.add(l);
  return () => changeListeners.delete(l);
};

/** Save a record (stamped as changed now) and let sync know. */
export async function save<T extends TableName>(name: T, record: Omit<Tables[T], "updatedAt" | "dirty">) {
  const full = { ...record, updatedAt: Date.now(), dirty: 1 } as Tables[T];
  await table(name).put(full);
  changeListeners.forEach((l) => l());
  return full;
}

/** Deletes are kept as tombstones until the server has them, so other devices drop the record too. */
export async function remove(name: TableName, id: string) {
  const existing = await table(name).get(id);
  if (existing) await save(name, { ...existing, deleted: true });
}

export const live = <T extends Synced>(rows: T[]) => rows.filter((r) => !r.deleted);

// ---------- Defaults ----------

// Fixed ids, so two devices that both seeded the defaults end up with one copy each after syncing.
const FOCUS_DEFAULTS: Record<Activity, string[]> = {
  climb: [
    "Limit",
    "Projecting",
    "4x4s",
    "Volume",
    "Power endurance",
    "Endurance / ARC",
    "Technique",
    "Onsight / flash",
  ],
  hang: ["Max hangs", "Repeaters", "Density hangs", "No-hangs"],
  lift: ["Pull", "Legs", "Antagonists", "Full body"],
  other: ["Mobility", "Core", "Cardio"],
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const DEFAULT_FOCUSES: Focus[] = Object.entries(FOCUS_DEFAULTS).flatMap(([activity, names]) =>
  names.map((name, order) => ({
    id: `${activity}-${slug(name)}`,
    name,
    activity: activity as Activity,
    order,
    updatedAt: 0,
  })),
);

export const DEFAULT_PLACES: Place[] = [
  { id: "place-moonboard", name: "Moonboard", kind: "board", updatedAt: 0 },
  { id: "place-synergy", name: "Synergy", kind: "gym", updatedAt: 0 },
  { id: "place-outside", name: "Outside", kind: "outside", updatedAt: 0 },
];

export const DEFAULT_SETTINGS: Settings = {
  id: "settings",
  targets: { climb: 3, hang: 2, lift: 1, other: 0 },
  deloadEveryWeeks: 6,
  updatedAt: 0,
};

/**
 * Add the defaults on first run. They're stamped `updatedAt: 0`, so anything
 * already on the server wins over them. Safe to call repeatedly.
 */
export async function ensureSeeded() {
  await db.transaction("rw", [db.settings, db.places, db.focuses], async () => {
    if (await db.settings.get("settings")) return;
    const dirty = { dirty: 1 as const };
    await db.settings.put({ ...DEFAULT_SETTINGS, ...dirty });
    await db.places.bulkPut(DEFAULT_PLACES.map((p) => ({ ...p, ...dirty })));
    await db.focuses.bulkPut(DEFAULT_FOCUSES.map((f) => ({ ...f, ...dirty })));
  });
}

/** Ask the browser not to evict our data (Safari is aggressive about this). */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
