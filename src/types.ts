/** Dates are local calendar days, `YYYY-MM-DD`. Weeks start on Monday. */
export type DateStr = string;

export type Activity = "climb" | "hang" | "lift" | "other";
export const ACTIVITIES: Activity[] = ["climb", "hang", "lift", "other"];
export const ACTIVITY_LABELS: Record<Activity, string> = {
  climb: "Climb",
  hang: "Hangboard",
  lift: "Lift",
  other: "Other",
};

export type PlaceKind = "board" | "gym" | "outside" | "other";
export const PLACE_KINDS: PlaceKind[] = ["board", "gym", "outside", "other"];
export const PLACE_KIND_LABELS: Record<PlaceKind, string> = {
  board: "Board",
  gym: "Indoor gym",
  outside: "Outside",
  other: "Other",
};

export type Style = "boulder" | "sport";
export const STYLE_LABELS: Record<Style, string> = { boulder: "Boulder", sport: "Sport" };

/**
 * Every synced record has these. `updatedAt` decides which copy wins when two
 * devices changed the same record; deletes are kept as `deleted: true` so they
 * reach other devices. `dirty` (local only) marks changes the server hasn't seen.
 */
export interface Synced {
  id: string;
  updatedAt: number;
  deleted?: boolean;
  dirty?: 0 | 1;
}

/** One training session. A day can have several. */
export interface Entry extends Synced {
  date: DateStr;
  activity: Activity;
  placeId?: string;
  /** Climbs only. Board climbs are always bouldering. */
  style?: Style;
  focusId?: string;
  /** 1 (easy) to 5 (max), optional. */
  effort?: number;
  note?: string;
}

export interface Place extends Synced {
  name: string;
  kind: PlaceKind;
  archived?: boolean;
}

/** What a session was about (limit, 4x4s, max hangs…), per activity. */
export interface Focus extends Synced {
  name: string;
  activity: Activity;
  order: number;
  archived?: boolean;
}

export interface Deload extends Synced {
  startDate: DateStr;
  endDate: DateStr;
  note?: string;
}

export const SEVERITY_LABELS = ["Niggle", "Sore", "Injured"];

/** A tweak or injury flagged on a day. */
export interface Injury extends Synced {
  date: DateStr;
  area: string;
  /** 1 niggle, 2 sore, 3 injured. */
  severity: number;
  note?: string;
}

export interface Settings extends Synced {
  id: "settings";
  /** Days per week to aim for. */
  targets: Record<Activity, number>;
  /** Nudge to deload after this many weeks without one (0 = never). */
  deloadEveryWeeks: number;
}

export type Tables = {
  entries: Entry;
  places: Place;
  focuses: Focus;
  deloads: Deload;
  injuries: Injury;
  settings: Settings;
};
export type TableName = keyof Tables;
export const TABLES: TableName[] = ["entries", "places", "focuses", "deloads", "injuries", "settings"];
