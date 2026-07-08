import { describe, expect, test } from "bun:test";
import {
  casinoAgainButtonId,
  casinoSetupButtonId,
  parseCasinoAgainButtonId,
} from "./replay";

const USER = "123456789012345678";

describe("casino replay buttons", () => {
  test("round-trips slots replay", () => {
    const id = casinoAgainButtonId({ userId: USER, game: "slots", amount: 500 });
    const parts = id.replace("casino:", "").split(":");
    expect(parseCasinoAgainButtonId(parts.slice(1))).toEqual({
      userId: USER,
      game: "slots",
      amount: 500,
    });
  });

  test("round-trips coinflip replay", () => {
    const id = casinoAgainButtonId({
      userId: USER,
      game: "coinflip",
      amount: 100,
      coinflipSide: "heads",
    });
    const parts = id.replace("casino:", "").split(":");
    expect(parseCasinoAgainButtonId(parts.slice(1))).toEqual({
      userId: USER,
      game: "coinflip",
      amount: 100,
      coinflipSide: "heads",
    });
  });

  test("round-trips keno replay", () => {
    const id = casinoAgainButtonId({
      userId: USER,
      game: "keno",
      amount: 250,
      kenoPicks: [3, 7, 14, 22],
    });
    const parts = id.replace("casino:", "").split(":");
    expect(parseCasinoAgainButtonId(parts.slice(1))).toEqual({
      userId: USER,
      game: "keno",
      amount: 250,
      kenoPicks: [3, 7, 14, 22],
    });
  });

  test("round-trips mines replay", () => {
    const id = casinoAgainButtonId({
      userId: USER,
      game: "mines",
      amount: 100,
      minesCount: 5,
    });
    const parts = id.replace("casino:", "").split(":");
    expect(parseCasinoAgainButtonId(parts.slice(1))).toEqual({
      userId: USER,
      game: "mines",
      amount: 100,
      minesCount: 5,
    });
  });

  test("round-trips roulette replay", () => {
    const id = casinoAgainButtonId({
      userId: USER,
      game: "roulette",
      amount: 250,
      rouletteBet: "red",
    });
    const parts = id.replace("casino:", "").split(":");
    expect(parseCasinoAgainButtonId(parts.slice(1))).toEqual({
      userId: USER,
      game: "roulette",
      amount: 250,
      rouletteBet: "red",
    });
  });

  test("setup button encodes owner and game", () => {
    expect(casinoSetupButtonId(USER, "plinko")).toBe(`casino:setup:${USER}:plinko`);
  });
});
