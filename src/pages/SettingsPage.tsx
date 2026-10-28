import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { ChipPicker, PageHeader, Section } from "../components/ui";
import { newId, remove, requestPersistence, save } from "../db";
import { useSession } from "../lib/auth";
import { backend } from "../lib/config";
import { formatRange, isDateStr, addDays, today, weekStart } from "../lib/dates";
import { useData, type Data } from "../lib/hooks";
import { scheduleSync, sync, useSyncStatus } from "../lib/sync";
import { backupJson, claudeText, download, importBackup, sessionsCsv } from "../lib/transfer";
import {
  ACTIVITIES,
  ACTIVITY_LABELS,
  PLACE_KIND_LABELS,
  PLACE_KINDS,
  type Activity,
  type Deload,
  type Focus,
  type Place,
} from "../types";

export function SettingsPage() {
  const data = useData();
  if (!data) return null;
  return (
    <div className="page">
      <PageHeader title="Settings" large />
      <AccountSection />
      <DataSection data={data} />
      <TargetsSection data={data} />
      <PlacesSection places={data.places} />
      <FocusSection data={data} />
      <DeloadsSection deloads={data.deloads} />
    </div>
  );
}

function AccountSection() {
  const session = useSession();
  const status = useSyncStatus();
  if (!backend) {
    return (
      <Section title="Sync">
        <p className="hint">
          This copy of the app keeps everything on this device. Export a backup now and then, or set up the server (see
          the README) to sync between devices.
        </p>
      </Section>
    );
  }
  const last = status.lastSyncedAt
    ? new Date(status.lastSyncedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "never";
  return (
    <Section title="Sync">
      {session ? (
        <div className="card row spread">
          <div>
            <strong>{session.email}</strong>
            <p className={`small ${status.state === "error" ? "error" : "muted"}`}>
              {status.state === "syncing"
                ? "Syncing…"
                : status.state === "error"
                  ? status.error
                  : `Last synced ${last}`}
            </p>
          </div>
          <button type="button" className="btn small" disabled={status.state === "syncing"} onClick={() => sync()}>
            Sync now
          </button>
        </div>
      ) : (
        <div className="card row spread">
          <p className="small">Sign in to back up and sync your log.</p>
          <Link className="btn small primary" to="/account">
            Sign in
          </Link>
        </div>
      )}
      {session && (
        <Link className="link small" to="/account">
          Account
        </Link>
      )}
    </Section>
  );
}

function DataSection({ data }: { data: Data }) {
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const stamp = today();
  const flash = (m: string) => {
    setMessage(m);
    setTimeout(() => setMessage(""), 4000);
  };

  const copyForClaude = async () => {
    try {
      await navigator.clipboard.writeText(claudeText(data));
      flash("Copied. Paste it into Claude and ask away.");
    } catch {
      download(`training-for-claude-${stamp}.txt`, claudeText(data), "text/plain");
      flash("Couldn’t copy, so it was downloaded as a text file instead.");
    }
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const n = await importBackup(await file.text());
      scheduleSync(0);
      flash(n ? `Imported ${n} ${n === 1 ? "record" : "records"}.` : "Nothing new in that backup.");
    } catch (e) {
      flash((e as Error).message || "Couldn’t read that file.");
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <Section title="Your data">
      <p className="hint">
        {data.entries.length} {data.entries.length === 1 ? "session" : "sessions"} logged. Copy for Claude puts your
        whole log on the clipboard, ready to paste into a chat with questions like “how often did I hangboard last
        month?”
      </p>
      <div className="button-grid">
        <button type="button" className="btn" onClick={copyForClaude}>
          <Icon name="copy" size={18} /> Copy for Claude
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => download(`training-sessions-${stamp}.csv`, sessionsCsv(data), "text/csv")}
        >
          <Icon name="download" size={18} /> Sessions CSV
        </button>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            download(`training-backup-${stamp}.json`, await backupJson(), "application/json");
            requestPersistence();
          }}
        >
          <Icon name="download" size={18} /> Backup
        </button>
        <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
          <Icon name="upload" size={18} /> Import backup
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => onImport(e.target.files?.[0])}
      />
      {message && (
        <p className="status" role="status">
          {message}
        </p>
      )}
    </Section>
  );
}

function TargetsSection({ data }: { data: Data }) {
  const s = data.settings;
  const setTarget = (a: Activity, n: number) =>
    save("settings", { ...s, targets: { ...s.targets, [a]: Math.max(0, Math.min(7, n)) } });
  return (
    <Section title="Goals">
      <ul className="settings-list">
        {ACTIVITIES.map((a) => (
          <li key={a}>
            <span>{ACTIVITY_LABELS[a]} days per week</span>
            <Stepper value={s.targets[a]} onChange={(n) => setTarget(a, n)} />
          </li>
        ))}
        <li>
          <span>Suggest a deload after (weeks)</span>
          <Stepper
            value={s.deloadEveryWeeks}
            onChange={(n) => save("settings", { ...s, deloadEveryWeeks: Math.max(0, Math.min(20, n)) })}
            zeroLabel="Off"
          />
        </li>
      </ul>
    </Section>
  );
}

function Stepper({ value, onChange, zeroLabel }: { value: number; onChange: (n: number) => void; zeroLabel?: string }) {
  return (
    <span className="stepper">
      <button
        type="button"
        className="icon-btn"
        aria-label="Less"
        disabled={value <= 0}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <span>{value === 0 && zeroLabel ? zeroLabel : value}</span>
      <button type="button" className="icon-btn" aria-label="More" onClick={() => onChange(value + 1)}>
        +
      </button>
    </span>
  );
}

function PlacesSection({ places }: { places: Place[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const add = async () => {
    const p = await save("places", { id: newId(), name: "New place", kind: "gym" });
    setEditing(p.id);
  };
  const active = places.filter((p) => !p.archived);
  const archived = places.filter((p) => p.archived);
  return (
    <Section
      title="Places"
      action={
        <button type="button" className="btn small outline" onClick={add}>
          <Icon name="plus" size={16} /> Add
        </button>
      }
    >
      <ul className="settings-list">
        {[...active, ...archived].map((p) =>
          editing === p.id ? (
            <li key={p.id} className="editing">
              <PlaceEditor place={p} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={p.id} className={p.archived ? "archived" : ""}>
              <button type="button" className="list-button" onClick={() => setEditing(p.id)}>
                <span>{p.name}</span>
                <span className="muted small">
                  {PLACE_KIND_LABELS[p.kind]}
                  {p.archived && " · hidden"}
                </span>
              </button>
            </li>
          ),
        )}
      </ul>
    </Section>
  );
}

function PlaceEditor({ place, onDone }: { place: Place; onDone: () => void }) {
  const [name, setName] = useState(place.name);
  const [kind, setKind] = useState(place.kind);
  const commit = async (patch: Partial<Place> = {}) => {
    await save("places", { ...place, name: name.trim() || place.name, kind, ...patch });
    onDone();
  };
  return (
    <div className="inline-form">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      <ChipPicker
        label="Kind of place"
        options={PLACE_KINDS.map((k) => ({ value: k, label: PLACE_KIND_LABELS[k] }))}
        value={kind}
        onChange={(k) => k && setKind(k)}
      />
      <div className="row">
        <button type="button" className="btn small" onClick={() => commit({ archived: !place.archived })}>
          {place.archived ? "Show again" : "Hide"}
        </button>
        <span className="spacer" />
        <button type="button" className="btn small" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className="btn small primary" onClick={() => commit()}>
          Save
        </button>
      </div>
      <p className="hint">Hiding keeps past sessions’ place but takes it off the log sheet.</p>
    </div>
  );
}

function FocusSection({ data }: { data: Data }) {
  const [activity, setActivity] = useState<Activity>("climb");
  const [name, setName] = useState("");
  const all = data.focuses.filter((f) => f.activity === activity);
  const add = async () => {
    if (!name.trim()) return;
    await save("focuses", {
      id: newId(),
      name: name.trim(),
      activity,
      order: Math.max(-1, ...all.map((f) => f.order)) + 1,
    });
    setName("");
  };
  const toggle = (f: Focus) => save("focuses", { ...f, archived: !f.archived });
  return (
    <Section title="Focus options">
      <ChipPicker
        label="Activity"
        options={ACTIVITIES.map((a) => ({ value: a, label: ACTIVITY_LABELS[a], activity: a }))}
        value={activity}
        onChange={(a) => a && setActivity(a)}
      />
      <ul className="settings-list">
        {all.map((f) => (
          <li key={f.id} className={f.archived ? "archived" : ""}>
            <span>{f.name}</span>
            <button type="button" className="btn small" onClick={() => toggle(f)}>
              {f.archived ? "Show" : "Hide"}
            </button>
          </li>
        ))}
      </ul>
      <div className="row">
        <input
          placeholder={`New ${ACTIVITY_LABELS[activity].toLowerCase()} focus`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button type="button" className="btn" disabled={!name.trim()} onClick={add}>
          Add
        </button>
      </div>
    </Section>
  );
}

function DeloadsSection({ deloads }: { deloads: Deload[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const add = async () => {
    const monday = weekStart(today());
    const d = await save("deloads", { id: newId(), startDate: monday, endDate: addDays(monday, 6) });
    setEditing(d.id);
  };
  return (
    <Section
      title="Deloads"
      action={
        <button type="button" className="btn small outline" onClick={add}>
          <Icon name="plus" size={16} /> Add
        </button>
      }
    >
      {deloads.length === 0 && (
        <p className="hint">Mark a deload week from the home screen or any day in the calendar.</p>
      )}
      <ul className="settings-list">
        {deloads.map((d) =>
          editing === d.id ? (
            <li key={d.id} className="editing">
              <DeloadEditor deload={d} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={d.id}>
              <button type="button" className="list-button" onClick={() => setEditing(d.id)}>
                <span>{formatRange(d.startDate, d.endDate)}</span>
                <span className="muted small">{d.note ?? d.startDate.slice(0, 4)}</span>
              </button>
            </li>
          ),
        )}
      </ul>
    </Section>
  );
}

function DeloadEditor({ deload, onDone }: { deload: Deload; onDone: () => void }) {
  const [start, setStart] = useState(deload.startDate);
  const [end, setEnd] = useState(deload.endDate);
  const [note, setNote] = useState(deload.note ?? "");
  const valid = isDateStr(start) && isDateStr(end) && start <= end;
  const commit = async () => {
    if (!valid) return;
    await save("deloads", { ...deload, startDate: start, endDate: end, note: note.trim() || undefined });
    onDone();
  };
  return (
    <div className="inline-form">
      <div className="row">
        <label className="field grow">
          <span className="field-label">From</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field grow">
          <span className="field-label">To</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="row">
        <button
          type="button"
          className="btn small danger"
          onClick={async () => {
            await remove("deloads", deload.id);
            onDone();
          }}
        >
          Delete
        </button>
        <span className="spacer" />
        <button type="button" className="btn small" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className="btn small primary" disabled={!valid} onClick={commit}>
          Save
        </button>
      </div>
    </div>
  );
}
