import type { DateStr } from "../types";

/** Local calendar dates as `YYYY-MM-DD` strings. Weeks start on Monday. */

const pad = (n: number) => String(n).padStart(2, "0");

export const toDateStr = (d: Date): DateStr => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Noon avoids daylight-saving edges when adding days. */
export const parseDate = (s: DateStr) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};

export const today = () => toDateStr(new Date());

export function addDays(s: DateStr, n: number): DateStr {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function weekStart(s: DateStr): DateStr {
  const day = parseDate(s).getDay(); // 0 = Sunday
  return addDays(s, -((day + 6) % 7));
}

export const daysBetween = (from: DateStr, to: DateStr) =>
  Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);

export const isDateStr = (s: unknown): s is DateStr => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Mondays from `from`'s week to `to`'s week, inclusive. */
export function weeksBetween(from: DateStr, to: DateStr): DateStr[] {
  const weeks: DateStr[] = [];
  for (let w = weekStart(from); w <= to; w = addDays(w, 7)) weeks.push(w);
  return weeks;
}

export const formatDay = (
  s: DateStr,
  opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" },
) => parseDate(s).toLocaleDateString(undefined, opts);

export function formatRange(from: DateStr, to: DateStr) {
  const a = parseDate(from);
  const b = parseDate(to);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const start = a.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const end = b.toLocaleDateString(undefined, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" });
  return `${start} – ${end}`;
}

/** "today", "yesterday", "3 days ago", "5 weeks ago". */
export function ago(s: DateStr, now = today()) {
  const days = daysBetween(s, now);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return `${Math.floor(days / 7)} weeks ago`;
}
