import { describe, expect, it } from "vitest";
import type { Deload, Entry } from "../types";
import { addDays, weekStart, weeksBetween } from "./dates";
import { daysPerWeek, frequentCombos, lastDeload } from "./stats";

let n = 0;
const entry = (date: string, activity: Entry["activity"], extra: Partial<Entry> = {}): Entry => ({
  id: `e${n++}`,
  updatedAt: n,
  date,
  activity,
  ...extra,
});

describe("dates", () => {
  it("starts weeks on Monday", () => {
    expect(weekStart("2026-10-28")).toBe("2026-10-26"); // Wednesday
    expect(weekStart("2026-10-26")).toBe("2026-10-26"); // Monday
    expect(weekStart("2026-11-01")).toBe("2026-10-26"); // Sunday
  });

  it("adds days across a daylight-saving change", () => {
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
  });

  it("lists the Mondays in a range", () => {
    expect(weeksBetween("2026-10-14", "2026-10-28")).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
  });
});

describe("daysPerWeek", () => {
  it("counts days, not sessions, per activity", () => {
    const entries = [
      entry("2026-10-26", "climb"),
      entry("2026-10-26", "climb"), // second session the same day
      entry("2026-10-28", "climb"),
      entry("2026-10-28", "hang"),
      entry("2026-11-01", "lift"), // Sunday, same week
      entry("2026-11-02", "climb"), // next week
    ];
    expect(daysPerWeek(entries, ["2026-10-26", "2026-11-02"])).toEqual([
      { week: "2026-10-26", days: { climb: 2, hang: 1, lift: 1, other: 0 } },
      { week: "2026-11-02", days: { climb: 1, hang: 0, lift: 0, other: 0 } },
    ]);
  });

  it("includes empty weeks", () => {
    expect(daysPerWeek([], ["2026-10-26"])).toEqual([
      { week: "2026-10-26", days: { climb: 0, hang: 0, lift: 0, other: 0 } },
    ]);
  });
});

describe("lastDeload", () => {
  const deload = (startDate: string, endDate: string): Deload => ({ id: startDate, updatedAt: 0, startDate, endDate });

  it("counts whole weeks since the latest deload ended", () => {
    const deloads = [deload("2026-08-03", "2026-08-09"), deload("2026-09-21", "2026-09-27")];
    const result = lastDeload(deloads, "2026-10-28");
    expect(result?.deload.startDate).toBe("2026-09-21");
    expect(result?.weeksSince).toBe(5);
  });

  it("is zero during a deload and ignores planned ones", () => {
    const deloads = [deload("2026-10-26", "2026-11-01"), deload("2026-12-07", "2026-12-13")];
    expect(lastDeload(deloads, "2026-10-28")).toEqual({ deload: deloads[0], weeksSince: 0 });
  });

  it("is undefined with no deloads yet", () => {
    expect(lastDeload([deload("2026-12-07", "2026-12-13")], "2026-10-28")).toBeUndefined();
  });
});

describe("frequentCombos", () => {
  it("ranks by how often, then how recently", () => {
    const board = { placeId: "moon", style: "boulder" as const, focusId: "limit" };
    const gym = { placeId: "gym", style: "boulder" as const, focusId: "volume" };
    const entries = [
      entry("2026-10-01", "climb", board),
      entry("2026-10-05", "climb", board),
      entry("2026-10-03", "climb", gym),
      entry("2026-10-20", "hang", { focusId: "max" }),
      entry("2026-10-04", "climb", gym),
    ];
    expect(frequentCombos(entries, 3)).toEqual([
      { activity: "climb", ...board },
      { activity: "climb", ...gym },
      { activity: "hang", placeId: undefined, style: undefined, focusId: "max" },
    ]);
  });
});
