import { describe, expect, it } from "vitest";
import { TripDB } from "@/lib/offline/db";

describe("offline database schema", () => {
  it("indexes the outbox target table used by expense reconciliation", () => {
    const db = new TripDB();
    const outbox = db.tables.find((table) => table.name === "outbox");

    expect(db.verno).toBe(2);
    expect(outbox?.schema.indexes.map((index) => index.name)).toContain("table");
    db.close();
  });
});
