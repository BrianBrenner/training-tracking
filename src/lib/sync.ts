/**
 * Local-first sync. Every change is written to IndexedDB straight away (so
 * logging works offline) and marked dirty; sync then pushes dirty records and
 * pulls everything back. When both sides changed a record, the newer
 * `updatedAt` wins. The whole log is small (a few hundred rows a year), so the
 * server sends all of it each time instead of tracking what changed.
 */
import { useSyncExternalStore } from "react";
import { db, onLocalChange, table } from "../db";
import { TABLES, type Synced, type TableName, type Tables } from "../types";
import { currentSession, idToken, onSessionChange } from "./auth";
import { backend } from "./config";

type ByTable = { [T in TableName]?: Tables[T][] };

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await idToken();
  if (!token) throw new Error("Sign in first.");
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${backend!.apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (res.status === 429 && !data.error) throw new Error("Too many requests at once. Wait a moment and try again.");
  if (!res.ok) throw new Error(data.error || data.message || `Request failed (${res.status}).`);
  return data as T;
}

/** Whether the server's copy should replace the local one. */
export function serverWins(local: Synced | undefined, server: Synced) {
  if (!local) return true;
  return !(local.dirty && local.updatedAt > server.updatedAt);
}

/** Apply what the server sent to the local cache. */
export async function merge(data: ByTable) {
  await db.transaction(
    "rw",
    TABLES.map((t) => db.table(t)),
    async () => {
      for (const name of TABLES) {
        const t = table(name);
        const server = new Map((data[name] ?? []).map((r) => [r.id, r]));
        const local = await t.toArray();
        const localById = new Map(local.map((r) => [r.id, r]));
        const winners = [...server.values()]
          .filter((r) => serverWins(localById.get(r.id), r))
          .map((r) => ({ ...r, dirty: 0 as const }));
        await t.bulkPut(winners as never[]);
        // Missing from the server (a new or reset backend): push it again rather than lose it.
        const missing = local.filter((r) => !server.has(r.id) && !r.dirty).map((r) => r.id);
        if (missing.length) await t.where("id").anyOf(missing).modify({ dirty: 1 });
      }
    },
  );
}

// ---------- Status ----------

export type SyncState = "local" | "signed-out" | "syncing" | "synced" | "error";
export interface SyncStatus {
  state: SyncState;
  error?: string;
  lastSyncedAt?: number;
}

const LAST_KEY = "training-last-sync";
const readLast = () => {
  try {
    return Number(localStorage.getItem(LAST_KEY)) || undefined;
  } catch {
    return undefined;
  }
};

let status: SyncStatus = initialStatus();
const listeners = new Set<() => void>();

function initialStatus(): SyncStatus {
  if (!backend) return { state: "local" };
  if (!currentSession()) return { state: "signed-out" };
  return { state: "synced", lastSyncedAt: readLast() };
}

function setStatus(next: SyncStatus) {
  status = next;
  listeners.forEach((l) => l());
}

export function useSyncStatus() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}

// ---------- Running a sync ----------

const BATCH = 200;
let running: Promise<void> | null = null;
let again = false;

/** Push local changes and pull everything. No-op in local mode or when signed out. */
export function sync(): Promise<void> {
  if (!backend) return Promise.resolve();
  if (!currentSession()) {
    setStatus({ state: "signed-out" });
    return Promise.resolve();
  }
  if (running) {
    again = true; // A change landed mid-sync; go once more when this one is done.
    return running;
  }
  running = doSync()
    .then(() => {
      const now = Date.now();
      try {
        localStorage.setItem(LAST_KEY, String(now));
      } catch {
        // Just won't show "last synced" after a reload.
      }
      setStatus({ state: "synced", lastSyncedAt: now });
    })
    .catch((e) => {
      console.warn("Sync failed", e);
      const error = navigator.onLine
        ? (e as Error).message || "Something went wrong."
        : "You’re offline. Changes are saved here and will sync later.";
      setStatus({ state: currentSession() ? "error" : "signed-out", error, lastSyncedAt: status.lastSyncedAt });
    })
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        sync();
      }
    });
  return running;
}

async function doSync() {
  setStatus({ ...status, state: "syncing" });
  const dirty: { name: TableName; record: Synced }[] = [];
  for (const name of TABLES) {
    for (const record of await table(name).where("dirty").equals(1).toArray()) dirty.push({ name, record });
  }
  let data: ByTable = {};
  // Always at least one request, which also pulls.
  for (let i = 0; i === 0 || i < dirty.length; i += BATCH) {
    const changes: Record<string, Synced[]> = {};
    for (const { name, record } of dirty.slice(i, i + BATCH)) {
      const { dirty: _dirty, ...rest } = record;
      (changes[name] ??= []).push(rest);
    }
    data = (await api<{ data: ByTable }>("POST", "/sync", { changes })).data;
  }
  await merge(data);
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Sync shortly after a change, batching a burst of edits into one request. */
export function scheduleSync(delay = 1500) {
  clearTimeout(timer);
  timer = setTimeout(() => sync(), delay);
}

export function startSync() {
  if (!backend) return;
  onLocalChange(() => scheduleSync());
  onSessionChange(() => sync());
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && sync());
  window.addEventListener("online", () => sync());
  sync();
}
