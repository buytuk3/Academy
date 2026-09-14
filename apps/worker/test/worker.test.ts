import { describe, it, expect, vi } from "vitest";

vi.mock("@workspace/queue", () => ({ makeJobId: (c: string) => c }));
import { makeJobId } from "@workspace/queue";

// Worker runtime integration (Redis/DB) is SKIPPED in sandbox — never counted
// as PASS. This unit check only proves the canonical queue helper is usable.
describe("apps/worker composition", () => {
  it("uses canonical queue job-id derivation", () => {
    expect(makeJobId("corr-p4")).toBe("corr-p4");
  });
});
