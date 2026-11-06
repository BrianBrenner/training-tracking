import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { ActivityDot, PageHeader } from "../components/ui";
import { addDays, ago, daysBetween, formatDay, formatRange, today, weekStart } from "../lib/dates";
import { toggleDeloadWeek } from "../lib/deloads";
import { entryLabel, useData } from "../lib/hooks";
import { daysPerWeek, deloadOn, lastDeload, latestInjury } from "../lib/stats";
import { ACTIVITY_LABELS, type Activity, type Entry } from "../types";

const TRACKED: Activity[] = ["climb", "hang", "lift"];

export function HomePage() {
  const data = useData();
  const navigate = useNavigate();
  if (!data) return null;

  const now = today();
  const week = weekStart(now);
  const weekEnd = addDays(week, 6);
  const weekDays = [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(week, n));
  const [{ days }] = daysPerWeek(data.entries, [week]);
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

  // This week's sessions by day, Monday first, each day in the order logged.
  const byDay = new Map<string, Entry[]>();
  const thisWeek = data.entries
    .filter((e) => e.date >= week && e.date <= weekEnd)
    .sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt - b.updatedAt);
  for (const e of thisWeek) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  return (
    <div className="page home">
      <PageHeader title="This week" large>
        <span className="muted small">{formatRange(week, weekEnd)}</span>
      </PageHeader>

      <div className="week-strip">
        {weekDays.map((d) => {
          const classes = [
            "strip-day",
            d === now && "today",
            d > now && "future",
            deloadOn(data.deloads, d) && "deload",
          ];
          return (
            <Link key={d} to={`/day/${d}`} className={classes.filter(Boolean).join(" ")}>
              <span className="strip-weekday">{formatDay(d, { weekday: "narrow" })}</span>
              <span className="strip-num">{Number(d.slice(8))}</span>
              <span className="strip-dots">
                {(byDay.get(d) ?? []).map((e) => (
                  <ActivityDot key={e.id} activity={e.activity} />
                ))}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="goals">
        {TRACKED.map((a) => {
          const target = data.settings.targets[a];
          return (
            <div key={a} className="goal" data-activity={a}>
              <span className="goal-text">
                <span>{ACTIVITY_LABELS[a]}</span>
                <strong>
                  {days[a]}
                  {target > 0 && <span className="muted">/{target}</span>}
                </strong>
              </span>
              {target > 0 && (
                <span className="progress">
                  <span style={{ width: `${Math.min(1, days[a] / target) * 100}%` }} />
                </span>
              )}
            </div>
          );
        })}
      </div>

      {byDay.size === 0 ? (
        <p className="empty">Nothing logged this week yet.</p>
      ) : (
        <ul className="week-sessions">
          {[...byDay.entries()].map(([date, entries]) => (
            <li key={date}>
              <Link to={`/day/${date}`} className="week-sessions-day">
                {date === now ? "Today" : formatDay(date, { weekday: "short" })}
              </Link>
              <div className="week-sessions-list">
                {entries.map((e) => (
                  <Link key={e.id} to={`/entries/${e.id}`} className="week-session">
                    <ActivityDot activity={e.activity} />
                    <span className="week-session-label">{entryLabel(e, data)}</span>
                    {e.effort && (
                      <span className="effort" aria-label={`Effort ${e.effort}`}>
                        {e.effort}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="home-footer">
        <div className={`home-footer-row ${deloadNow ? "deload-active" : dueForDeload ? "deload-due" : ""}`}>
          <span className="home-footer-text">
            <strong>{deloadNow ? "Deload week" : dueForDeload ? "Time for a deload?" : "Last deload"}</strong>
            <span className="muted">
              {deloadNow
                ? formatRange(deloadNow.startDate, deloadNow.endDate)
                : last
                  ? `${formatDay(last.deload.startDate, { month: "short", day: "numeric" })} · ${last.weeksSince} ${last.weeksSince === 1 ? "wk" : "wks"} ago`
                  : "none yet"}
            </span>
          </span>
          <button type="button" className="btn small outline" onClick={() => toggleDeloadWeek(data.deloads, week)}>
            {deloadNow ? "Undo" : "Deload this week"}
          </button>
        </div>
        <div className="home-footer-row">
          {injury ? (
            <Link to={`/injuries/${injury.id}`} className="home-footer-text">
              <strong>Last tweak</strong>
              <span className="muted">
                {injury.area} · {ago(injury.date, now)}
              </span>
            </Link>
          ) : (
            <span className="muted">No tweaks logged</span>
          )}
          <Link to={`/injuries/new?date=${now}`} className="btn small outline">
            <Icon name="bandage" size={15} /> Flag a tweak
          </Link>
        </div>
      </div>

      <button type="button" className="fab" onClick={() => navigate("/log")}>
        <Icon name="plus" size={22} /> Log session
      </button>
    </div>
  );
}
