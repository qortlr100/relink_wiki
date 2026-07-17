import { describe, expect, it } from "vitest";
import { resolveReviewNotice } from "./review-notices";

describe("review notice resolver", () => {
  it("returns only an owned notice code", () => {
    expect(resolveReviewNotice("decision_saved")).toEqual({
      tone: "success",
      message: "레코드 검수 결정을 저장했습니다.",
    });
    expect(resolveReviewNotice(["review_rejected", "decision_saved"])).toEqual({
      tone: "error",
      message: "거절된 변경 레코드가 있어 승인할 수 없습니다.",
    });
  });

  it("ignores inherited and unknown object keys", () => {
    expect(resolveReviewNotice("__proto__")).toBeUndefined();
    expect(resolveReviewNotice("constructor")).toBeUndefined();
    expect(resolveReviewNotice("unknown")).toBeUndefined();
    expect(resolveReviewNotice(undefined)).toBeUndefined();
  });
});
