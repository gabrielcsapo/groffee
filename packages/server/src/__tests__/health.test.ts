import { describe, it, expect } from "vitest";
import { get } from "./helpers.js";

describe("GET /api/health", () => {
  it("returns ok status", async () => {
    const res = await get("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
