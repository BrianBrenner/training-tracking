import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { db, DEFAULT_SETTINGS, live } from "../db";
import type { Activity, Deload, Entry, Focus, Injury, Place, Settings } from "../types";

export interface Data {
  entries: Entry[];
  places: Place[];
  focuses: Focus[];
  deloads: Deload[];
  injuries: Injury[];
  settings: Settings;
  place: (id?: string) => Place | undefined;
  focus: (id?: string) => Focus | undefined;
  /** Focus options for an activity, in order, without archived ones. */
  focusesFor: (activity: Activity) => Focus[];
}

/** Everything (it's small), kept live. Undefined while loading. */
export function useData(): Data | undefined {
  return useLiveQuery(async () => {
    const [entries, places, focuses, deloads, injuries, settings] = await Promise.all([
      db.entries.toArray(),
      db.places.toArray(),
      db.focuses.toArray(),
      db.deloads.toArray(),
      db.injuries.toArray(),
      db.settings.get("settings"),
    ]);
    const livePlaces = live(places).sort((a, b) => a.name.localeCompare(b.name));
    const liveFocuses = live(focuses).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    const placeById = new Map(livePlaces.map((p) => [p.id, p]));
    const focusById = new Map(liveFocuses.map((f) => [f.id, f]));
    return {
      entries: live(entries).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt),
      places: livePlaces,
      focuses: liveFocuses,
      deloads: live(deloads).sort((a, b) => b.startDate.localeCompare(a.startDate)),
      injuries: live(injuries).sort((a, b) => b.date.localeCompare(a.date)),
      settings: settings && !settings.deleted ? settings : DEFAULT_SETTINGS,
      place: (id?: string) => (id ? placeById.get(id) : undefined),
      focus: (id?: string) => (id ? focusById.get(id) : undefined),
      focusesFor: (activity: Activity) => liveFocuses.filter((f) => f.activity === activity && !f.archived),
    };
  });
}

/** Short label for a session, e.g. "Moonboard · Limit" or "Hangboard · Max hangs". */
export function entryLabel(e: Pick<Entry, "activity" | "placeId" | "style" | "focusId">, data: Data) {
  const place = data.place(e.placeId);
  const focus = data.focus(e.focusId);
  const parts: string[] = [];
  if (e.activity === "climb") {
    parts.push(place?.name ?? "Climb");
    if (e.style && place?.kind !== "board") parts.push(e.style === "sport" ? "Sport" : "Boulder");
  } else {
    parts.push({ hang: "Hangboard", lift: "Lift", other: "Other" }[e.activity]);
    if (place) parts.push(place.name);
  }
  if (focus) parts.push(focus.name);
  return parts.join(" · ");
}

/** useState persisted to localStorage (per-device conveniences like the stats range). */
export function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Private mode etc. — just won't persist.
    }
  }, [key, value]);
  return [value, setValue] as const;
}
