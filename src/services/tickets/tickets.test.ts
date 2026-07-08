import { describe, expect, test } from "bun:test";
import { formatTicketId } from "./tickets";

describe("formatTicketId", () => {
  test("returns first 8 hex chars uppercase without dashes", () => {
    expect(formatTicketId("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe("A1B2C3D4");
  });
});
