import { ACTIVITIES, type Activity, type DateStr, type Deload, type Entry, type Injury } from "../types";
import { daysBetween, weekStart } from "./dates";

export type ActivityCounts = Record<Activity, number>;
const zero = (): ActivityCounts => ({ climb: 0, hang: 0, lift: 0, other: 0 });

/**
 * Days per week with each activity. Two climbing sessions on one day (board in
 * the morning, gym at night) count as one climbing day.
 */
export function daysPerWeek(entries: Entry[], weeks: DateStr[]): { week: DateStr; days: ActivityCounts }[] {
  const seen = new Map<DateStr, Map<Activity, Set<DateStr>>>();
  for (const e of entries) {
    const w = weekStart(e.date);
    let byActivity = seen.get(w);
    if (!byActivity) seen.set(w, (byActivity = new Map()));
    let dates = byActivity.get(e.activity);
    if (!dates) byActivity.set(e.activity, (dates = new Set()));
    dates.add(e.date);
  }
  return weeks.map((week) => {
    const days = zero();
    for (const [activity, dates] of seen.get(week) ?? []) days[activity] = dates.size;
    return { week, days };
  });
}

export function averageDays(rows: { days: ActivityCounts }[]): ActivityCounts {
  const avg = zero();
  if (!rows.length) return avg;
  for (const a of ACTIVITIES) avg[a] = rows.reduce((sum, r) => sum + r.days[a], 0) / rows.length;
  return avg;
}

export const inRange = <T extends { date: DateStr }>(rows: T[], from: DateStr, to: DateStr) =>
  rows.filter((r) => r.date >= from && r.date <= to);

/** Most recent date matching, or undefined. */
export function lastDate(entries: Entry[], match: (e: Entry) => boolean): DateStr | undefined {
  let last: DateStr | undefined;
  for (const e of entries) if (match(e) && (!last || e.date > last)) last = e.date;
  return last;
}

export const deloadOn = (deloads: Deload[], date: DateStr) =>
  deloads.find((d) => d.startDate <= date && date <= d.endDate);

/** The latest deload that has started, and whole weeks since it ended (0 while it's running). */
export function lastDeload(deloads: Deload[], now: DateStr): { deload: Deload; weeksSince: number } | undefined {
  const started = deloads.filter((d) => d.startDate <= now).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const deload = started[0];
  if (!deload) return undefined;
  const weeksSince = deload.endDate >= now ? 0 : Math.floor(daysBetween(weekStart(deload.endDate), weekStart(now)) / 7);
  return { deload, weeksSince };
}

export const latestInjury = (injuries: Injury[]) => [...injuries].sort((a, b) => b.date.localeCompare(a.date))[0];

/** Count rows per key, most common first. Rows with no key are skipped. */
export function countBy<T>(rows: T[], key: (r: T) => string | undefined): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export type Combo = Pick<Entry, "activity" | "placeId" | "style" | "focusId">;
const comboKey = (c: Combo) => [c.activity, c.placeId ?? "", c.style ?? "", c.focusId ?? ""].join("|");

/** The sessions logged most often (ties go to the most recent), for one-tap logging. */
export function frequentCombos(entries: Entry[], limit: number): Combo[] {
  const groups = new Map<string, { combo: Combo; count: number; last: DateStr }>();
  for (const e of entries) {
    const key = comboKey(e);
    const g = groups.get(key);
    if (g) {
      g.count++;
      if (e.date > g.last) g.last = e.date;
    } else {
      groups.set(key, {
        combo: { activity: e.activity, placeId: e.placeId, style: e.style, focusId: e.focusId },
        count: 1,
        last: e.date,
      });
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, limit)
    .map((g) => g.combo);
}

/** The most recent session of an activity, to prefill the next one. */
export function lastOfActivity(entries: Entry[], activity: Activity): Entry | undefined {
  return entries
    .filter((e) => e.activity === activity)
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt)[0];
}
