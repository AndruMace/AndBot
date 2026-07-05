import { describe, expect, test } from "bun:test";
import { isRewardablePayload } from "../services/activity";

describe("activity rewards", () => {
  test("accepts normal guild messages", () => {
    expect(
      isRewardablePayload({
        id: "1",
        guild_id: "g1",
        author: { id: "u1", bot: false },
        type: 0,
      }),
    ).toBe(true);
  });

  test("rejects bots, webhooks, and DMs", () => {
    expect(
      isRewardablePayload({
        id: "1",
        author: { id: "u1", bot: false },
        type: 0,
      }),
    ).toBe(false);

    expect(
      isRewardablePayload({
        id: "1",
        guild_id: "g1",
        author: { id: "u1", bot: true },
        type: 0,
      }),
    ).toBe(false);

    expect(
      isRewardablePayload({
        id: "1",
        guild_id: "g1",
        author: { id: "u1", bot: false },
        webhook_id: "wh1",
        type: 0,
      }),
    ).toBe(false);
  });

  test("rejects system message types", () => {
    expect(
      isRewardablePayload({
        id: "1",
        guild_id: "g1",
        author: { id: "u1", bot: false },
        type: 7,
      }),
    ).toBe(false);
  });
});
