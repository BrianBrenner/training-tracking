import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ActivityDot, ChipPicker, PageHeader } from "../components/ui";
import { Icon } from "../components/Icon";
import { newId, remove, save } from "../db";
import { addDays, formatDay, isDateStr, today } from "../lib/dates";
import { entryLabel, useData, type Data } from "../lib/hooks";
import { frequentCombos, lastOfActivity, type Combo } from "../lib/stats";
import {
  ACTIVITIES,
  ACTIVITY_LABELS,
  PLACE_KIND_LABELS,
  PLACE_KINDS,
  type Activity,
  type Entry,
  type PlaceKind,
  type Style,
} from "../types";

const EFFORT_LABELS = ["Easy", "Moderate", "Hard", "Very hard", "Max"];

/** New session (/log?date=…) or editing one (/entries/:id). */
export function LogPage() {
  const data = useData();
  const { entryId } = useParams();
  if (!data) return null;
  const existing = entryId ? data.entries.find((e) => e.id === entryId) : undefined;
  if (entryId && !existing) {
    return (
      <div className="page">
        <PageHeader title="Session" back />
        <p className="empty">This session was deleted.</p>
      </div>
    );
  }
  return <LogForm key={entryId ?? "new"} data={data} existing={existing} />;
}

function LogForm({ data, existing }: { data: Data; existing?: Entry }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialDate = existing?.date ?? (isDateStr(params.get("date")) ? params.get("date")! : today());

  const [date, setDate] = useState(initialDate);
  const [activity, setActivity] = useState<Activity | undefined>(existing?.activity);
  const [placeId, setPlaceId] = useState(existing?.placeId);
  const [style, setStyle] = useState<Style | undefined>(existing?.style);
  const [focusId, setFocusId] = useState(existing?.focusId);
  const [effort, setEffort] = useState(existing?.effort);
  const [note, setNote] = useState(existing?.note ?? "");
  const [addingPlace, setAddingPlace] = useState(false);

  const place = data.place(placeId);
  const showStyle = activity === "climb" && place && place.kind !== "board";

  // New sessions start from the last one of the same activity: usually the same place, often the same focus.
  const pickActivity = (a: Activity | undefined) => {
    setActivity(a);
    if (existing || !a) return;
    const last = lastOfActivity(data.entries, a);
    setPlaceId(last?.placeId && data.place(last.placeId)?.archived !== true ? last.placeId : undefined);
    setStyle(last?.style);
    setFocusId(last?.focusId && !data.focus(last.focusId)?.archived ? last.focusId : undefined);
  };

  const places = data.places.filter((p) => !p.archived || p.id === placeId);
  const placeOptions = (activity === "climb" ? places : places.filter((p) => p.kind !== "board")).map((p) => ({
    value: p.id,
    label: p.name,
  }));
  const focusOptions = activity
    ? [...data.focusesFor(activity), ...(focusId && data.focus(focusId)?.archived ? [data.focus(focusId)!] : [])].map(
        (f) => ({
          value: f.id,
          label: f.name,
        }),
      )
    : [];

  const combos = useMemo(() => {
    const recent = data.entries.filter((e) => e.date >= addDays(today(), -90));
    return frequentCombos(recent, 8)
      .filter((c) => (!c.placeId || data.place(c.placeId)) && (!c.focusId || data.focus(c.focusId)))
      .slice(0, 6);
  }, [data]);

  const record = (c: Combo & Partial<Entry>): Omit<Entry, "updatedAt" | "dirty"> => {
    const kind = data.place(c.placeId)?.kind;
    return {
      id: existing?.id ?? newId(),
      date,
      activity: c.activity,
      placeId: c.placeId,
      // Board climbs are always bouldering.
      style: c.activity === "climb" ? (kind === "board" ? "boulder" : c.style) : undefined,
      focusId: c.focusId,
      effort: c.effort,
      note: c.note?.trim() || undefined,
    };
  };

  const done = () => navigate(-1);

  const submit = async () => {
    if (!activity) return;
    await save("entries", record({ activity, placeId, style, focusId, effort, note }));
    done();
  };

  const quickLog = async (c: Combo) => {
    await save("entries", record(c));
    done();
  };

  const del = async () => {
    if (existing && confirm("Delete this session?")) {
      await remove("entries", existing.id);
      done();
    }
  };

  return (
    <div className="page log-page">
      <PageHeader title={existing ? "Edit session" : "Log session"} back>
        {existing && (
          <button type="button" className="icon-btn danger" aria-label="Delete session" onClick={del}>
            <Icon name="trash" />
          </button>
        )}
      </PageHeader>

      <div className="date-row">
        <button type="button" className="icon-btn" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
          <Icon name="back" />
        </button>
        <label className="date-label">
          <span>{date === today() ? `Today, ${formatDay(date)}` : formatDay(date)}</span>
          <input
            type="date"
            value={date}
            max={addDays(today(), 365)}
            onChange={(e) => isDateStr(e.target.value) && setDate(e.target.value)}
          />
        </label>
        <button type="button" className="icon-btn" aria-label="Next day" onClick={() => setDate(addDays(date, 1))}>
          <Icon name="next" />
        </button>
      </div>

      {!existing && combos.length > 0 && (
        <div className="field">
          <span className="field-label">Log again in one tap</span>
          <div className="chips">
            {combos.map((c) => (
              <button key={entryLabel(c, data)} type="button" className="chip quick" onClick={() => quickLog(c)}>
                <ActivityDot activity={c.activity} />
                {entryLabel(c, data)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <span className="field-label">Activity</span>
        <ChipPicker
          label="Activity"
          options={ACTIVITIES.map((a) => ({ value: a, label: ACTIVITY_LABELS[a], activity: a }))}
          value={activity}
          onChange={pickActivity}
        />
      </div>

      {activity && activity !== "hang" && (
        <div className="field">
          <span className="field-label">{activity === "climb" ? "Where" : "Where (optional)"}</span>
          <div className="chips-with-add">
            <ChipPicker label="Place" options={placeOptions} value={placeId} onChange={setPlaceId} clearable />
            {!addingPlace && (
              <button type="button" className="chip add" onClick={() => setAddingPlace(true)}>
                <Icon name="plus" size={16} /> New place
              </button>
            )}
          </div>
          {addingPlace && (
            <NewPlace
              defaultKind={activity === "climb" ? "gym" : "other"}
              onCancel={() => setAddingPlace(false)}
              onAdded={(id) => {
                setPlaceId(id);
                setAddingPlace(false);
              }}
            />
          )}
        </div>
      )}

      {showStyle && (
        <div className="field">
          <span className="field-label">Style</span>
          <ChipPicker
            label="Style"
            options={[
              { value: "boulder" as const, label: "Boulder" },
              { value: "sport" as const, label: "Sport" },
            ]}
            value={style}
            onChange={setStyle}
            clearable
          />
        </div>
      )}

      {activity && (
        <div className="field">
          <span className="field-label">Focus</span>
          <ChipPicker label="Focus" options={focusOptions} value={focusId} onChange={setFocusId} clearable />
        </div>
      )}

      {activity && (
        <details className="more" open={!!(existing?.effort || existing?.note)}>
          <summary>Effort and note</summary>
          <div className="field">
            <span className="field-label">Effort</span>
            <ChipPicker
              label="Effort"
              options={EFFORT_LABELS.map((label, i) => ({ value: String(i + 1), label: `${i + 1} ${label}` }))}
              value={effort ? String(effort) : undefined}
              onChange={(v) => setEffort(v ? Number(v) : undefined)}
              clearable
            />
          </div>
          <label className="field">
            <span className="field-label">Note</span>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Sent the project, skin was bad…"
            />
          </label>
        </details>
      )}

      <div className="sticky-actions">
        <button type="button" className="btn primary block" disabled={!activity} onClick={submit}>
          {existing ? "Save" : "Log it"}
        </button>
      </div>
    </div>
  );
}

function NewPlace({
  defaultKind,
  onAdded,
  onCancel,
}: {
  defaultKind: PlaceKind;
  onAdded: (id: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PlaceKind>(defaultKind);
  const add = async () => {
    if (!name.trim()) return;
    const place = await save("places", { id: newId(), name: name.trim(), kind });
    onAdded(place.id);
  };
  return (
    <div className="inline-form">
      <input
        autoFocus
        placeholder="Name, e.g. Castle Rock"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
      <ChipPicker
        label="Kind of place"
        options={PLACE_KINDS.map((k) => ({ value: k, label: PLACE_KIND_LABELS[k] }))}
        value={kind}
        onChange={(k) => k && setKind(k)}
      />
      <div className="row">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!name.trim()} onClick={add}>
          Add place
        </button>
      </div>
    </div>
  );
}
