import { newId, remove, save } from "../db";
import type { DateStr, Deload } from "../types";
import { addDays } from "./dates";

/** Mark the week starting `monday` as a deload, or unmark it if it already is one. */
export async function toggleDeloadWeek(deloads: Deload[], monday: DateStr) {
  const sunday = addDays(monday, 6);
  const overlapping = deloads.filter((d) => d.startDate <= sunday && d.endDate >= monday);
  if (overlapping.length) {
    for (const d of overlapping) await remove("deloads", d.id);
    return;
  }
  await save("deloads", { id: newId(), startDate: monday, endDate: sunday });
}
