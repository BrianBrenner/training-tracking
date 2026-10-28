import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { ActivityDot, PageHeader } from "../components/ui";
import { addDays, parseDate, today, toDateStr, weekStart } from "../lib/dates";
import { useData, useStoredState } from "../lib/hooks";
import { deloadOn } from "../lib/stats";
import { ACTIVITIES, ACTIVITY_LABELS, type Entry } from "../types";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function CalendarPage() {
  const data = useData();
  const [month, setMonth] = useStoredState("calendar-month", today().slice(0, 7));
  if (!data) return null;

  const first = `${month}-01`;
  const firstDate = parseDate(first);
  const last = toDateStr(new Date(firstDate.getFullYear(), firstDate.getMonth() + 1, 0, 12));
  const shift = (n: number) =>
    setMonth(toDateStr(new Date(firstDate.getFullYear(), firstDate.getMonth() + n, 1, 12)).slice(0, 7));

  const byDate = new Map<string, Entry[]>();
  for (const e of data.entries)
    if (e.date >= addDays(first, -7) && e.date <= addDays(last, 7))
      byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const injuries = new Set(data.injuries.map((i) => i.date));

  const days: string[] = [];
  for (let d = weekStart(first); d <= last || days.length % 7; d = addDays(d, 1)) days.push(d);
  const now = today();
  const monthEntries = data.entries.filter((e) => e.date >= first && e.date <= last);

  return (
    <div className="page">
      <PageHeader title={firstDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })} large>
        <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}>
          <Icon name="back" />
        </button>
        <button type="button" className="btn small" onClick={() => setMonth(now.slice(0, 7))}>
          Today
        </button>
        <button type="button" className="icon-btn" aria-label="Next month" onClick={() => shift(1)}>
          <Icon name="next" />
        </button>
      </PageHeader>

      <div className="calendar">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="calendar-weekday">
            {d}
          </span>
        ))}
        {days.map((d) => {
          const entries = byDate.get(d) ?? [];
          const classes = [
            "calendar-day",
            d.slice(0, 7) !== month && "outside",
            d === now && "today",
            deloadOn(data.deloads, d) && "deload",
          ].filter(Boolean);
          return (
            <Link
              key={d}
              to={`/day/${d}`}
              className={classes.join(" ")}
              aria-label={`${d}: ${entries.length} sessions`}
            >
              <span className="calendar-num">
                {Number(d.slice(8))}
                {injuries.has(d) && <span className="dot injury" />}
              </span>
              <span className="calendar-dots">
                {entries.map((e) => (
                  <ActivityDot key={e.id} activity={e.activity} />
                ))}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="legend">
        {ACTIVITIES.map((a) => (
          <span key={a}>
            <ActivityDot activity={a} /> {ACTIVITY_LABELS[a]}
          </span>
        ))}
        <span>
          <span className="swatch deload" /> Deload
        </span>
        <span>
          <span className="dot injury" /> Tweak
        </span>
      </div>

      <p className="hint center">
        {monthEntries.length} {monthEntries.length === 1 ? "session" : "sessions"} on{" "}
        {new Set(monthEntries.map((e) => e.date)).size} days this month
      </p>
    </div>
  );
}
