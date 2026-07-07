import { describe, expect, test } from "bun:test";
import {
  buildGameHeader,
  buildLotteryPublicDescription,
  prefixDescription,
  publicResultFooter,
  PublicGameMessageError,
  rollbackCreatedSession,
} from "./publicMessage";
import { formatPresentationOutcome, type PresentationContext } from "./presentations";

const config = {
  CURRENCY_NAME: "coins",
  CURRENCY_SYMBOL: "🪙",
} as Parameters<typeof buildGameHeader>[3];

describe("publicMessage", () => {
  test("buildGameHeader includes player and wager", () => {
    const header = buildGameHeader("user123", "Slots", 500, config);
    expect(header).toContain("<@user123>");
    expect(header).toContain("Slots");
    expect(header).toContain("500");
  });

  test("publicResultFooter omits balance", () => {
    const footer = publicResultFooter(100, 200, config);
    expect(footer).toContain("Wager");
    expect(footer).toContain("Payout");
    expect(footer).not.toContain("Balance");
  });

  test("publicResultFooter shows loss line", () => {
    const footer = publicResultFooter(100, 0, config, { lost: true });
    expect(footer).toContain("Lost");
  });

  test("prefixDescription combines header and body", () => {
    const text = prefixDescription("header", "body");
    expect(text).toBe("header\n\nbody");
  });

  test("lottery public description excludes ticket numbers", () => {
    const description = buildLotteryPublicDescription(
      "user123",
      5,
      250,
      12,
      12400,
      84,
      "2d 5h",
      config,
    );
    expect(description).toContain("<@user123>");
    expect(description).toContain("**5** ticket");
    expect(description).toContain("Round **#12**");
    expect(description).not.toMatch(/ticket number/i);
  });

  test("formatPresentationOutcome strips balance when public", () => {
    const ctx: PresentationContext = {
      isPublic: true,
      userId: "user123",
      gameLabel: "Coinflip",
      wager: 100,
      config,
    };
    const footer = formatPresentationOutcome(ctx, 100, 200, config, { balance: 9999 });
    expect(footer).not.toContain("Balance");
    expect(footer).toContain("Payout");
  });

  test("formatPresentationOutcome includes balance when private", () => {
    const footer = formatPresentationOutcome(undefined, 100, 200, config, { balance: 500 });
    expect(footer).toContain("Balance");
  });

  test("rollbackCreatedSession expires unpublished sessions", async () => {
    let expired = false;
    await rollbackCreatedSession(
      new Error("channel send failed"),
      "session-1",
      async () => ({ status: "active" }),
      async () => {
        expired = true;
      },
    );
    expect(expired).toBe(true);
  });

  test("rollbackCreatedSession skips when message was published", async () => {
    let expired = false;
    await rollbackCreatedSession(
      new PublicGameMessageError("ack failed", "msg-123"),
      "session-1",
      async () => ({ status: "active" }),
      async () => {
        expired = true;
      },
    );
    expect(expired).toBe(false);
  });
});
