import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { Activity } from "../types";
import { Icon } from "./Icon";

/** Top bar. `large` is for the tab roots; otherwise a compact bar with a back button. */
export function PageHeader({
  title,
  back,
  large,
  children,
}: {
  title: ReactNode;
  back?: boolean;
  large?: boolean;
  children?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className={`page-header ${large ? "large" : ""}`}>
      {back && (
        <button type="button" className="icon-btn" aria-label="Back" onClick={() => navigate(-1)}>
          <Icon name="back" size={24} />
        </button>
      )}
      <h1>{title}</h1>
      <div className="header-actions">{children}</div>
    </header>
  );
}

/** A row of single-choice chips. Tapping the selected chip again clears it when `clearable`. */
export function ChipPicker<T extends string>({
  options,
  value,
  onChange,
  clearable,
  label,
}: {
  options: { value: T; label: string; activity?: Activity }[];
  value: T | undefined;
  onChange: (v: T | undefined) => void;
  clearable?: boolean;
  label: string;
}) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`chip ${selected ? "selected" : ""}`}
            data-activity={o.activity}
            onClick={() => onChange(selected && clearable ? undefined : o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const ActivityDot = ({ activity }: { activity: Activity }) => <span className="dot" data-activity={activity} />;

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Horizontal bars for a breakdown (sessions by focus, by place…). */
export function BarList({ rows, activity }: { rows: { label: string; count: number }[]; activity?: Activity }) {
  if (!rows.length) return <p className="hint">Nothing logged in this range.</p>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <ul className="bar-list">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            <span className="bar-fill" data-activity={activity} style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
          <span className="bar-count">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}
