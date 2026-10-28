import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { ActivityDot, PageHeader, Section } from "../components/ui";
import { addDays, formatDay, isDateStr, weekStart } from "../lib/dates";
import { toggleDeloadWeek } from "../lib/deloads";
import { entryLabel, useData } from "../lib/hooks";
import { deloadOn } from "../lib/stats";
import { SEVERITY_LABELS } from "../types";

export function DayPage() {
  const { date = "" } = useParams();
  const data = useData();
  const navigate = useNavigate();
  if (!data) return null;
  if (!isDateStr(date)) return <p className="empty">Not a date.</p>;

  const entries = data.entries.filter((e) => e.date === date);
  const injuries = data.injuries.filter((i) => i.date === date);
  const deload = deloadOn(data.deloads, date);
  const go = (n: number) => navigate(`/day/${addDays(date, n)}`, { replace: true });

  return (
    <div className="page">
      <PageHeader title={formatDay(date, { weekday: "long", month: "long", day: "numeric" })} back>
        <button type="button" className="icon-btn" aria-label="Previous day" onClick={() => go(-1)}>
          <Icon name="back" />
        </button>
        <button type="button" className="icon-btn" aria-label="Next day" onClick={() => go(1)}>
          <Icon name="next" />
        </button>
      </PageHeader>

      <Section title="Sessions">
        {entries.length === 0 ? (
          <p className="empty">Rest day.</p>
        ) : (
          <ul className="session-list">
            {entries.map((e) => (
              <li key={e.id}>
                <Link to={`/entries/${e.id}`} className="session-row">
                  <ActivityDot activity={e.activity} />
                  <span>
                    {entryLabel(e, data)}
                    {e.note && <span className="session-note">{e.note}</span>}
                  </span>
                  {e.effort && <span className="muted small">effort {e.effort}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link to={`/log?date=${date}`} className="btn primary block">
          <Icon name="plus" size={18} /> Log session
        </Link>
      </Section>

      <Section title="Tweaks">
        {injuries.length > 0 && (
          <ul className="session-list">
            {injuries.map((i) => (
              <li key={i.id}>
                <Link to={`/injuries/${i.id}`} className="session-row">
                  <span className="dot injury" />
                  <span>
                    {i.area} · {SEVERITY_LABELS[i.severity - 1]}
                    {i.note && <span className="session-note">{i.note}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link to={`/injuries/new?date=${date}`} className="btn outline block">
          <Icon name="bandage" size={18} /> Flag a tweak
        </Link>
      </Section>

      <Section title="Deload">
        <button
          type="button"
          className={`btn block ${deload ? "" : "outline"}`}
          onClick={() => toggleDeloadWeek(data.deloads, weekStart(date))}
        >
          {deload ? "This week is a deload · Undo" : "Mark this week as a deload"}
        </button>
      </Section>
    </div>
  );
}
