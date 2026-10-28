/**
 * Getting data out (and back in): a JSON backup of everything, a CSV of
 * sessions for spreadsheets, and a plain-text copy for pasting into Claude.
 */
import { db } from "../db";
import { ACTIVITY_LABELS, PLACE_KIND_LABELS, TABLES, type Synced, type TableName } from "../types";
import { daysPerWeek, lastDeload } from "./stats";
import { today, weeksBetween } from "./dates";
import type { Data } from "./hooks";

const FORMAT = "training-log-backup";

export async function backupJson() {
  const tables: Record<string, unknown[]> = {};
  for (const name of TABLES) tables[name] = (await db.table(name).toArray()).map(({ dirty: _d, ...r }) => r);
  return JSON.stringify({ format: FORMAT, version: 1, exportedAt: new Date().toISOString(), tables }, null, 2);
}

/**
 * Restore a backup. Records are merged in (newer copies win), so importing onto
 * a device that already has data never loses anything newer.
 */
export async function importBackup(json: string): Promise<number> {
  const parsed = JSON.parse(json);
  if (parsed?.format !== FORMAT || typeof parsed.tables !== "object")
    throw new Error("That isn’t a training log backup.");
  let count = 0;
  await db.transaction(
    "rw",
    TABLES.map((t) => db.table(t)),
    async () => {
      for (const name of TABLES as TableName[]) {
        const rows = (parsed.tables[name] ?? []) as Synced[];
        const t = db.table<Synced, string>(name);
        for (const row of rows) {
          if (typeof row?.id !== "string" || typeof row.updatedAt !== "number") continue;
          const existing = await t.get(row.id);
          if (existing && existing.updatedAt >= row.updatedAt) continue;
          await t.put({ ...row, dirty: 1 });
          count++;
        }
      }
    },
  );
  return count;
}

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per session, oldest first, with names instead of ids. */
export function sessionsCsv(data: Data) {
  const header = ["date", "activity", "place", "place_kind", "style", "focus", "effort", "deload_week", "note"];
  const rows = [...data.entries].reverse().map((e) => {
    const place = data.place(e.placeId);
    const deload = data.deloads.some((d) => d.startDate <= e.date && e.date <= d.endDate);
    return [
      e.date,
      ACTIVITY_LABELS[e.activity],
      place?.name,
      place && PLACE_KIND_LABELS[place.kind],
      e.activity === "climb" ? (place?.kind === "board" ? "boulder" : e.style) : "",
      data.focus(e.focusId)?.name,
      e.effort,
      deload ? "yes" : "",
      e.note,
    ];
  });
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

/** Everything Claude needs to answer questions about the log, as one paste. */
export function claudeText(data: Data) {
  const now = today();
  const weeks = weeksBetween(data.entries.at(-1)?.date ?? now, now);
  const weekly = daysPerWeek(data.entries, weeks)
    .map((w) => `${w.week},${w.days.climb},${w.days.hang},${w.days.lift},${w.days.other}`)
    .join("\n");
  const last = lastDeload(data.deloads, now);
  const t = data.settings.targets;
  return `Here is my climbing training log. Please use it to answer my questions.

Today is ${now}. Weeks start on Monday.
Each session row is one training session; a day can have several. "effort" is 1 (easy) to 5 (max), blank if not recorded.
Place kinds: board = training board (always bouldering), gym = indoor gym, outside = real rock.
My weekly targets (days per week): climb ${t.climb}, hangboard ${t.hang}, lift ${t.lift}.
Last deload: ${last ? `${last.deload.startDate} to ${last.deload.endDate}` : "none logged"}.

## Sessions (CSV)
${sessionsCsv(data)}

## Days per week by activity (CSV; a day with two climbing sessions counts once)
week_start,climb,hang,lift,other
${weekly}

## Deload periods (CSV)
start,end,note
${data.deloads.map((d) => [d.startDate, d.endDate, d.note].map(csvCell).join(",")).join("\n")}

## Tweaks and injuries (CSV; severity 1 niggle, 2 sore, 3 injured)
date,area,severity,note
${data.injuries.map((i) => [i.date, i.area, i.severity, i.note].map(csvCell).join(",")).join("\n")}
`;
}

export function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

