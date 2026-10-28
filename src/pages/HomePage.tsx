import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { ActivityDot, PageHeader, Section } from "../components/ui";
import { addDays, ago, daysBetween, formatDay, formatRange, today, weekStart } from "../lib/dates";
import { toggleDeloadWeek } from "../lib/deloads";
import { entryLabel, useData } from "../lib/hooks";
import { daysPerWeek, deloadOn, lastDate, lastDeload, latestInjury } from "../lib/stats";
import { ACTIVITY_LABELS, type Activity } from "../types";

const TRACKED: Activity[] = ["climb", "hang", "lift"];

export function HomePage() {
  const data = useData();
  const navigate = useNavigate();
  if (!data) return null;

  const now = today();
  const week = weekStart(now);
  const weekEnd = addDays(week, 6);
  const [{ days }] = daysPerWeek(data.entries, [week]);
  const thisWeek = data.entries.filter((e) => e.date >= week && e.date <= weekEnd);
  const deloadNow = deloadOn(data.deloads, now);
  const last = lastDeload(data.deloads, now);
  const every = data.settings.deloadEveryWeeks;
  // With no deload yet, count from the first session logged.
  const firstEntry = data.entries.at(-1)?.date;
  const weeksTraining = last
    ? last.weeksSince
    : firstEntry
      ? Math.floor(daysBetween(weekStart(firstEntry), week) / 7)
      : 0;
  const dueForDeload = !deloadNow && every > 0 && weeksTraining >= every;
  const injury = latestInjury(data.injuries);

  // This week's sessions by day, newest first.
  const byDay = new Map<string, typeof thisWeek>();
  for (const e of thisWeek) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  return (
    <div className="page">
      <PageHeader title="This week" large>
        <span className="muted small">{formatRange(week, weekEnd)}</span>
      </PageHeader>

      <div className="tiles">
        {TRACKED.map((a) => {
          const target = data.settings.targets[a];
          return (
            <div key={a} className="tile" data-activity={a}>
              <span className="tile-label">{ACTIVITY_LABELS[a]}</span>
              <span className="tile-value">
                {days[a]}
                {target > 0 && <span className="muted">/{target}</span>}
              </span>
              <span className="tile-sub">days</span>
              {target > 0 && (
                <span className="progress">
                  <span style={{ width: `${Math.min(1, days[a] / target) * 100}%` }} />
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className={`card deload-card ${deloadNow ? "active" : dueForDeload ? "due" : ""}`}>
        <div>
          <strong>{deloadNow ? "Deload week" : dueForDeload ? "Time for a deload?" : "Last deload"}</strong>
          <p className="muted small">
            {deloadNow
              ? formatRange(deloadNow.startDate, deloadNow.endDate)
              : last
                ? `${formatRange(last.deload.startDate, last.deload.endDate)} · ${last.weeksSince} ${last.weeksSince === 1 ? "week" : "weeks"} ago`
                : "None logged yet"}
          </p>
        </div>
        <button
          type="button"
          className={`btn small ${deloadNow ? "" : "outline"}`}
          onClick={() => toggleDeloadWeek(data.deloads, week)}
        >
          {deloadNow ? "Not a deload" : "Deload this week"}
        </button>
      </div>

      <div className="since">
        {TRACKED.map((a) => {
          const d = lastDate(data.entries, (e) => e.activity === a);
          return (
            <div key={a}>
              <ActivityDot activity={a} />
              <span>{ACTIVITY_LABELS[a]}</span>
              <span className="muted">{d ? ago(d, now) : "never"}</span>
            </div>
          );
        })}
        {injury && (
          <Link to={`/injuries/${injury.id}`}>
            <span className="dot injury" />
            <span>Last tweak: {injury.area}</span>
            <span className="muted">{ago(injury.date, now)}</span>
          </Link>
        )}
      </div>

      <Section
        title="Sessions"
        action={
          <Link to={`/injuries/new?date=${now}`} className="btn small outline">
            <Icon name="bandage" size={16} /> Flag a tweak
          </Link>
        }
      >
        {byDay.size === 0 ? (
          <p className="empty">Nothing logged this week yet.</p>
        ) : (
          <ul className="day-list">
            {[...byDay.entries()].map(([date, entries]) => (
              <li key={date}>
                <Link to={`/day/${date}`} className="day-list-date">
                  {date === now ? "Today" : formatDay(date, { weekday: "long" })}
                </Link>
                {entries.map((e) => (
                  <Link key={e.id} to={`/entries/${e.id}`} className="session-row">
                    <ActivityDot activity={e.activity} />
                    <span>{entryLabel(e, data)}</span>
                    {e.effort && <span className="muted small">effort {e.effort}</span>}
                  </Link>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <button type="button" className="fab" onClick={() => navigate("/log")}>
        <Icon name="plus" size={22} /> Log session
      </button>
    </div>
  );
}
