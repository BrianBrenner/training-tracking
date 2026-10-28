/**
 * The whole API as one function of (request, dependencies), so it runs in
 * Lambda, in the local dev server and in tests with an in-memory repo.
 *
 * Owner only, for reads and writes alike. Cognito's pre sign-up hook already
 * refuses every other email; this checks again in case that ever changes.
 *
 *   GET  /me     who's signed in
 *   POST /sync   { changes: { entries: [...], places: [...], … } } → { data: everything }
 *
 * When a change and the stored copy disagree, the newer `updatedAt` wins.
 */

export const ENTITY_TYPES = ["entries", "places", "focuses", "deloads", "injuries", "settings"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Item = { id: string } & Record<string, any>;

export interface Repo {
  list(type: EntityType): Promise<Item[]>;
  get(type: EntityType, id: string): Promise<Item | undefined>;
  put(type: EntityType, item: Item): Promise<void>;
  delete(type: EntityType, id: string): Promise<void>;
}

export interface Deps {
  repo: Repo;
  ownerEmail: string;
}

/** Verified claims from the sign-in token (API Gateway checks the signature). */
export interface Claims {
  sub: string;
  email?: string;
  email_verified?: string | boolean;
}

export interface Request {
  method: string;
  path: string;
  body?: unknown;
  claims?: Claims;
}

export interface Response {
  status: number;
  body?: unknown;
}

/** Far more than one sync ever sends; the app batches anything bigger. */
export const MAX_CHANGES = 500;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};

function isOwner(claims: Claims | undefined, ownerEmail: string) {
  const email = (claims?.email ?? "").toLowerCase();
  const verified = claims?.email_verified === true || claims?.email_verified === "true";
  return !!claims?.sub && verified && !!ownerEmail && email === ownerEmail.toLowerCase();
}

// ---------- Validation (just enough to keep junk out) ----------

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : undefined);
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fail(400, "Bad date."));
const oneOf = <T extends string>(v: unknown, options: readonly T[]) =>
  options.includes(v as T) ? (v as T) : undefined;
const int = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : undefined;

const ACTIVITIES = ["climb", "hang", "lift", "other"] as const;
const PLACE_KINDS = ["board", "gym", "outside", "other"] as const;

/** The stored shape of each record type: known fields only, trimmed to size. */
const FIELDS: Record<EntityType, (b: Record<string, unknown>) => Record<string, unknown>> = {
  entries: (b) => ({
    date: date(b.date),
    activity: oneOf(b.activity, ACTIVITIES) ?? fail(400, "Bad activity."),
    placeId: str(b.placeId, 100),
    style: oneOf(b.style, ["boulder", "sport"] as const),
    focusId: str(b.focusId, 100),
    effort: int(b.effort, 1, 5),
    note: str(b.note, 2000),
  }),
  places: (b) => ({
    name: str(b.name, 80) ?? "",
    kind: oneOf(b.kind, PLACE_KINDS) ?? "other",
    archived: b.archived === true || undefined,
  }),
  focuses: (b) => ({
    name: str(b.name, 60) ?? "",
    activity: oneOf(b.activity, ACTIVITIES) ?? fail(400, "Bad activity."),
    order: int(b.order, 0, 1000) ?? 0,
    archived: b.archived === true || undefined,
  }),
  deloads: (b) => ({ startDate: date(b.startDate), endDate: date(b.endDate), note: str(b.note, 200) }),
  injuries: (b) => ({
    date: date(b.date),
    area: str(b.area, 80) ?? "",
    severity: int(b.severity, 1, 3) ?? 1,
    note: str(b.note, 2000),
  }),
  settings: (b) => {
    const t = isObj(b.targets) ? b.targets : {};
    return {
      targets: Object.fromEntries(ACTIVITIES.map((a) => [a, int(t[a], 0, 7) ?? 0])),
      deloadEveryWeeks: int(b.deloadEveryWeeks, 0, 20) ?? 0,
    };
  },
};

function clean(type: EntityType, raw: unknown): Item {
  if (!isObj(raw)) fail(400, "Expected a record.");
  const b = raw as Record<string, unknown>;
  const id = str(b.id, 100);
  if (!id || id.includes("/")) fail(400, "Bad id.");
  if (typeof b.updatedAt !== "number" || !Number.isFinite(b.updatedAt)) fail(400, "Missing updatedAt.");
  // A deleted record only needs to say so; its fields may be stale.
  if (b.deleted === true) return { id: id!, updatedAt: b.updatedAt as number, deleted: true };
  const fields = Object.fromEntries(Object.entries(FIELDS[type](b)).filter(([, v]) => v !== undefined));
  return { ...fields, id: id!, updatedAt: b.updatedAt as number };
}

// ---------- Handler ----------

export async function handle(req: Request, deps: Deps): Promise<Response> {
  try {
    return await route(req, deps);
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: { error: e.message } };
    console.error(e);
    return { status: 500, body: { error: "Something went wrong." } };
  }
}

async function route(req: Request, deps: Deps): Promise<Response> {
  const { repo } = deps;
  if (!req.claims?.sub) fail(401, "Sign in first.");
  if (!isOwner(req.claims, deps.ownerEmail)) fail(403, "This log belongs to someone else.");

  if (req.method === "GET" && req.path === "/me") {
    return { status: 200, body: { email: req.claims!.email } };
  }

  if (req.method === "POST" && req.path === "/sync") {
    const changes = isObj(req.body) && isObj(req.body.changes) ? req.body.changes : {};
    const incoming: [EntityType, Item][] = [];
    for (const [type, rows] of Object.entries(changes)) {
      if (!(ENTITY_TYPES as readonly string[]).includes(type)) fail(400, `Unknown type ${type}.`);
      if (!Array.isArray(rows)) fail(400, "Expected a list of records.");
      for (const row of rows as unknown[]) incoming.push([type as EntityType, clean(type as EntityType, row)]);
    }
    if (incoming.length > MAX_CHANGES) fail(400, `Send at most ${MAX_CHANGES} changes at once.`);

    for (const [type, item] of incoming) {
      const existing = await repo.get(type, item.id);
      if (!existing || item.updatedAt >= existing.updatedAt) await repo.put(type, item);
    }

    const lists = await Promise.all(ENTITY_TYPES.map((t) => repo.list(t)));
    return { status: 200, body: { data: Object.fromEntries(ENTITY_TYPES.map((t, i) => [t, lists[i]])) } };
  }

  return fail(404, "Not found.");
}

/** Simple in-memory repo for tests and the local dev server. */
export function memoryRepo(): Repo & { data: Map<string, Item> } {
  const data = new Map<string, Item>();
  const key = (type: EntityType, id: string) => `${type}:${id}`;
  return {
    data,
    async list(type) {
      return [...data.entries()].filter(([k]) => k.startsWith(`${type}:`)).map(([, v]) => structuredClone(v));
    },
    async get(type, id) {
      const v = data.get(key(type, id));
      return v && structuredClone(v);
    },
    async put(type, item) {
      data.set(key(type, item.id), structuredClone(item));
    },
    async delete(type, id) {
      data.delete(key(type, id));
    },
  };
}
