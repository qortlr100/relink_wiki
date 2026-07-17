import { describe, expect, it } from "vitest";
import { buildReviewNoticeHref, hasOwnKey, recordIndexFormSchema } from "./review-input";

describe("review input validation", () => {
  it("accepts only a non-empty decimal record index", () => {
    expect(recordIndexFormSchema.parse("0")).toBe(0);
    expect(recordIndexFormSchema.parse("42")).toBe(42);

    for (const value of ["", " ", "-1", "1.5", "1e2", "not-a-number"]) {
      expect(recordIndexFormSchema.safeParse(value).success).toBe(false);
    }
  });

  it("accepts only owned option keys", () => {
    const labels = { approved: "승인", rejected: "거절" } as const;

    expect(hasOwnKey(labels, "approved")).toBe(true);
    expect(hasOwnKey(labels, "__proto__")).toBe(false);
    expect(hasOwnKey(labels, "constructor")).toBe(false);
    expect(hasOwnKey(labels, "toString")).toBe(false);
    expect(hasOwnKey(labels, undefined)).toBe(false);
  });

  it("builds a safe notice URL that preserves valid review navigation", () => {
    expect(
      buildReviewNoticeHref("decision_saved", {
        category: "skill",
        diff: "changed",
        decision: "pending",
        page: "3",
      }),
    ).toBe("/?notice=decision_saved&category=skill&diff=changed&decision=pending&page=3#review");

    expect(
      buildReviewNoticeHref("review_input_invalid", {
        category: "__proto__",
        diff: "constructor",
        decision: "unknown",
        page: "0",
      }),
    ).toBe("/?notice=review_input_invalid#review");
  });
});
