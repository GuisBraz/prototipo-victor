import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { shouldProcess } from "./processing.js";

describe("shouldProcess", () => {
  it("dispara quando o job entra em queued", () => {
    expect(shouldProcess(undefined, { status: "queued" })).toBe(true);
    expect(shouldProcess({ status: "failed" }, { status: "queued" })).toBe(true);
  });

  it("dispara no redisparo da varredura (kickedAt mudou)", () => {
    expect(shouldProcess({ status: "queued" }, { status: "queued", kickedAt: Timestamp.fromMillis(1) })).toBe(true);
    expect(
      shouldProcess({ status: "queued", kickedAt: Timestamp.fromMillis(1) }, { status: "queued", kickedAt: Timestamp.fromMillis(1) }),
    ).toBe(false);
  });

  it("não dispara em outras escritas", () => {
    expect(shouldProcess({ status: "queued" }, { status: "running" })).toBe(false);
    expect(shouldProcess({ status: "running" }, { status: "succeeded" })).toBe(false);
    expect(shouldProcess({ status: "queued" }, undefined)).toBe(false);
  });
});
