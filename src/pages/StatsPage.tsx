import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { BarList, ChipPicker, PageHeader, Section } from "../components/ui";
import { addDays, formatDay, today, weekStart, weeksBetween } from "../lib/dates";
import { useData, useStoredState, type Data } from "../lib/hooks";
import { averageDays, countBy, daysPerWeek, deloadOn, inRange } from "../lib/stats";
import { ACTIVITIES, ACTIVITY_LABELS, PLACE_KIND_LABELS, SEVERITY_LABELS,
  STYLE_LABELS, type Activity, type Entry } from "../types";

const RANGES = [
  { value: "4", label: "4 wks" },
  { value: "12", label: "12 wks" },
  { value: "26", label: "6 mo" },
  { value: "52", label: "1 yr" },
  { value: "all", label: "All" },
];

export function StatsPage() {
  const data = useData();
  const [range, setRange] = useStoredState("stats-range", "12");
  if (!data) return null;

  const now = today();
  const oldest = data.entries.at(-1)?.date ?? now;
  const from = range === "all" ? weekStart(oldest) : addDays(weekStart(now), -7 * (Number(range) - 1));
  const weeks = weeksBetween(from, now);
  const entries = inRange(data.entries, from, now);
  const weekly = daysPerWeek(entries, weeks);
  const avg = averageDays(weekly);
  const shown = ACTIVITIES.filter((a) => a !== "other" || entries.some((e) => e.activity === "other"));
  const injuryWeeks = new Set(inRange(data.injuries, from, now).map((i) => weekStart(i.date)));

  return (
    <div className="page">
      <PageHeader title="Stats" large />
      <ChipPicker label="Range" options={RANGES} value={range} onChange={(v) => v && setRange(v)} />

      <Section title="Days per week">
        <div className="week-charts">
          {shown.map((a) => (
            <WeekChart
              key={a}
              activity={a}
              rows={weekly.map((w) => ({
                week: w.week,
                days: w.days[a],
                deload: !!deloadOn(data.deloads, w.week) || !!deloadOn(data.deloads, addDays(w.week, 6)),
                injury: injuryWeeks.has(w.week),
              }))}
              average={avg[a]}
              target={data.settings.targets[a]}
            />
          ))}
          <div className="week-axis">
            <span>{formatDay(from, { month: "short", day: "numeric" })}</span>
            <span>
              <span className="swatch deload" /> deload <span className="dot injury" /> tweak
            </span>
            <span>this week</span>
          </div>
        </div>
      </Section>

      <Section title="Activity">
        <ActivityMap entries={data.entries} />
      </Section>

      <Breakdowns data={data} entries={entries} />

      <Section title="Tweaks">
        {inRange(data.injuries, from, now).length === 0 ? (
          <p className="hint">None in this range.</p>
        ) : (
          <ul className="session-list">
            {inRange(data.injuries, from, now).map((i) => (
              <li key={i.id}>
                <Link to={`/injuries/${i.id}`} className="session-row">
                  <span className="dot injury" />
                  <span>
                    {i.area} · {SEVERITY_LABELS[i.severity - 1]}
                  </span>
                  <span className="muted small">{formatDay(i.date, { month: "short", day: "numeric" })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function WeekChart({
  activity,
  rows,
  average,
  target,
}: {
  activity: Activity;
  rows: { week: string; days: number; deload: boolean; injury: boolean }[];
  average: number;
  target: number;
}) {
  const max = 7;
  return (
    <div className="week-chart">
      <div className="week-chart-head">
        <span>{ACTIVITY_LABELS[activity]}</span>
        <span className="muted small">
          {average.toFixed(1)}/wk{target > 0 && ` · target ${target}`}
        </span>
      </div>
      <div className="week-bars" style={{ "--target": `${(target / max) * 100}%` } as CSSProperties}>
        {target > 0 && <span className="target-line" />}
        {rows.map((r) => (
          <span
            key={r.week}
            className={`week-col ${r.deload ? "deload" : ""}`}
            title={`Week of ${formatDay(r.week, { month: "short", day: "numeric" })}: ${r.days} ${r.days === 1 ? "day" : "days"}${r.deload ? " (deload)" : ""}`}
          >
            {r.injury && activity === "climb" && <span className="dot injury" />}
            <span className="week-bar" data-activity={activity} style={{ height: `${(r.days / max) * 100}%` }} />
          </span>
        ))}
      </div>
    </div>
  );
}

/** The last year, one square per day, darker for more sessions. */
function ActivityMap({ entries }: { entries: Entry[] }) {
  const now = today();
  const start = addDays(weekStart(now), -51 * 7);
  const counts = new Map<string, number>();
  for (const e of entries) if (e.date >= start) counts.set(e.date, (counts.get(e.date) ?? 0) + 1);
  const days: string[] = [];
  for (let d = start; d <= addDays(weekStart(now), 6); d = addDays(d, 1)) days.push(d);
  return (
    <div className="heatmap" role="img" aria-label="Sessions per day over the last year">
      {days.map((d) => (
        <span
          key={d}
          className="heat"
          data-level={d > now ? "future" : Math.min(3, counts.get(d) ?? 0)}
          title={`${d}: ${counts.get(d) ?? 0}`}
        />
      ))}
    </div>
  );
}

function Breakdowns({ data, entries }: { data: Data; entries: Entry[] }) {
  const climbs = entries.filter((e) => e.activity === "climb");
  const named = (rows: { key: string; count: number }[], name: (k: string) => string) =>
    rows.map((r) => ({ label: name(r.key), count: r.count }));
  const byFocus = (rows: Entry[]) =>
    named(
      countBy(rows, (e) => e.focusId),
      (k) => data.focus(k)?.name ?? "Removed focus",
    );
  const kindOf = (e: Entry) => data.place(e.placeId)?.kind;
  const styleOf = (e: Entry) => (kindOf(e) === "board" ? "boulder" : e.style);

  return (
    <>
      <Section title={`Climbing · ${climbs.length} sessions`}>
        <h3>Where</h3>
        <BarList
          activity="climb"
          rows={named(
            countBy(climbs, (e) => kindOf(e)),
            (k) => PLACE_KIND_LABELS[k as keyof typeof PLACE_KIND_LABELS],
          )}
        />
        <h3>Style</h3>
        <BarList
          activity="climb"
          rows={named(countBy(climbs, styleOf), (k) => STYLE_LABELS[k as keyof typeof STYLE_LABELS])}
        />
        <h3>Focus</h3>
        <BarList activity="climb" rows={byFocus(climbs)} />
        <h3>Places</h3>
        <BarList
          activity="climb"
          rows={named(
            countBy(climbs, (e) => e.placeId),
            (k) => data.place(k)?.name ?? "Removed place",
          )}
        />
      </Section>
      {(["hang", "lift"] as const).map((a) => {
        const rows = entries.filter((e) => e.activity === a);
        return (
          <Section key={a} title={`${ACTIVITY_LABELS[a]} · ${rows.length} sessions`}>
            <BarList activity={a} rows={byFocus(rows)} />
          </Section>
        );
      })}
    </>
  );
}
