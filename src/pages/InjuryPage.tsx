import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { ChipPicker, PageHeader } from "../components/ui";
import { newId, remove, save } from "../db";
import { isDateStr, today } from "../lib/dates";
import { useData } from "../lib/hooks";
import { SEVERITY_LABELS, type Injury } from "../types";

const AREAS = ["Finger", "Elbow", "Shoulder", "Wrist", "Knee", "Back", "Skin"];

/** Flag a tweak (/injuries/new?date=…) or edit one (/injuries/:id). */
export function InjuryPage() {
  const data = useData();
  const { injuryId } = useParams();
  if (!data) return null;
  const existing = injuryId ? data.injuries.find((i) => i.id === injuryId) : undefined;
  if (injuryId && !existing) {
    return (
      <div className="page">
        <PageHeader title="Tweak" back />
        <p className="empty">This was deleted.</p>
      </div>
    );
  }
  // Past areas first, so "L ring A2" is one tap the second time.
  const pastAreas = [...new Set(data.injuries.map((i) => i.area))];
  return (
    <InjuryForm
      key={injuryId ?? "new"}
      existing={existing}
      suggestions={[...new Set([...pastAreas, ...AREAS])].slice(0, 12)}
    />
  );
}

function InjuryForm({ existing, suggestions }: { existing?: Injury; suggestions: string[] }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [date, setDate] = useState(existing?.date ?? (isDateStr(params.get("date")) ? params.get("date")! : today()));
  const [area, setArea] = useState(existing?.area ?? "");
  const [severity, setSeverity] = useState(existing?.severity ?? 1);
  const [note, setNote] = useState(existing?.note ?? "");

  const submit = async () => {
    if (!area.trim()) return;
    await save("injuries", {
      id: existing?.id ?? newId(),
      date,
      area: area.trim(),
      severity,
      note: note.trim() || undefined,
    });
    navigate(-1);
  };
  const del = async () => {
    if (existing && confirm("Delete this tweak?")) {
      await remove("injuries", existing.id);
      navigate(-1);
    }
  };

  return (
    <div className="page">
      <PageHeader title={existing ? "Edit tweak" : "Flag a tweak"} back>
        {existing && (
          <button type="button" className="icon-btn danger" aria-label="Delete tweak" onClick={del}>
            <Icon name="trash" />
          </button>
        )}
      </PageHeader>

      <label className="field">
        <span className="field-label">Date</span>
        <input type="date" value={date} onChange={(e) => isDateStr(e.target.value) && setDate(e.target.value)} />
      </label>

      <label className="field">
        <span className="field-label">What</span>
        <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Left ring A2" />
      </label>
      <div className="chips">
        {suggestions.map((s) => (
          <button key={s} type="button" className={`chip ${s === area ? "selected" : ""}`} onClick={() => setArea(s)}>
            {s}
          </button>
        ))}
      </div>

      <div className="field">
        <span className="field-label">How bad</span>
        <ChipPicker
          label="Severity"
          options={SEVERITY_LABELS.map((label, i) => ({ value: String(i + 1), label }))}
          value={String(severity)}
          onChange={(v) => v && setSeverity(Number(v))}
        />
      </div>

      <label className="field">
        <span className="field-label">Note</span>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Felt it on a crimpy move, sore to press"
        />
      </label>

      <div className="sticky-actions">
        <button type="button" className="btn primary block" disabled={!area.trim()} onClick={submit}>
          Save
        </button>
      </div>
    </div>
  );
}
