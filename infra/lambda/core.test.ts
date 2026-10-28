import { describe, expect, it } from "vitest";
import { handle, memoryRepo, type Claims, type Deps } from "./core";

const OWNER = "me@example.com";
const owner: Claims = { sub: "owner", email: OWNER, email_verified: "true" };

function setup() {
  const repo = memoryRepo();
  const deps: Deps = { repo, ownerEmail: OWNER };
  // `null` means signed out (`undefined` would pick up the default).
  const sync = (changes: Record<string, unknown[]>, claims: Claims | null = owner) =>
    handle({ method: "POST", path: "/sync", body: { changes }, claims: claims ?? undefined }, deps);
  return { repo, sync };
}

const entry = (id: string, updatedAt: number, extra: Record<string, unknown> = {}) => ({
  id,
  updatedAt,
  date: "2026-10-28",
  activity: "climb",
  ...extra,
});

describe("access", () => {
  it("refuses requests without a sign-in", async () => {
    const { sync } = setup();
    expect((await sync({}, null)).status).toBe(401);
  });

  it("refuses anyone but the owner, even signed in", async () => {
    const { sync, repo } = setup();
    const res = await sync(
      { entries: [entry("a", 1)] },
      { sub: "x", email: "someone@example.com", email_verified: "true" },
    );
    expect(res.status).toBe(403);
    expect(repo.data.size).toBe(0);
  });

  it("refuses the owner email when it is not verified", async () => {
    const { sync } = setup();
    expect((await sync({}, { ...owner, email_verified: "false" })).status).toBe(403);
  });
});

describe("sync", () => {
  it("stores changes and returns everything", async () => {
    const { sync } = setup();
    await sync({ places: [{ id: "moon", updatedAt: 1, name: "Moonboard", kind: "board" }] });
    const res = await sync({ entries: [entry("a", 2, { placeId: "moon", focusId: "limit", effort: 4 })] });
    expect(res.status).toBe(200);
    const data = (res.body as { data: Record<string, unknown[]> }).data;
    expect(data.entries).toEqual([
      { id: "a", updatedAt: 2, date: "2026-10-28", activity: "climb", placeId: "moon", focusId: "limit", effort: 4 },
    ]);
    expect(data.places).toEqual([{ id: "moon", updatedAt: 1, name: "Moonboard", kind: "board" }]);
  });

  it("keeps the newer copy when an older change arrives late", async () => {
    const { sync, repo } = setup();
    await sync({ entries: [entry("a", 10, { note: "newer" })] });
    await sync({ entries: [entry("a", 5, { note: "older" })] });
    expect((await repo.get("entries", "a"))?.note).toBe("newer");
  });

  it("keeps deletes as tombstones without their old fields", async () => {
    const { sync, repo } = setup();
    await sync({ entries: [entry("a", 1, { note: "x" })] });
    await sync({ entries: [{ id: "a", updatedAt: 2, deleted: true, note: "x" }] });
    expect(await repo.get("entries", "a")).toEqual({ id: "a", updatedAt: 2, deleted: true });
  });

  it("drops unknown fields and clamps numbers", async () => {
    const { sync, repo } = setup();
    await sync({ entries: [entry("a", 1, { effort: 9, isAdmin: true })] });
    expect(await repo.get("entries", "a")).toEqual({
      id: "a",
      updatedAt: 1,
      date: "2026-10-28",
      activity: "climb",
      effort: 5,
    });
  });

  it("rejects a bad record and stores nothing from that request", async () => {
    const { sync, repo } = setup();
    const res = await sync({ entries: [entry("a", 1), entry("b", 1, { date: "tomorrow" })] });
    expect(res.status).toBe(400);
    expect(repo.data.size).toBe(0);
  });

  it("rejects unknown record types", async () => {
    const { sync } = setup();
    expect((await sync({ users: [{ id: "x", updatedAt: 1 }] })).status).toBe(400);
  });
});
