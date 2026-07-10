import { describe, expect, test } from "bun:test";
import { CasinoBusyError, CasinoLockService } from "./lock";

describe("casino lock", () => {
  test("rejects overlapping actions for the same user", async () => {
    const lock = new CasinoLockService();
    let innerRunning = false;

    const first = lock.run("g1", "u1", async () => {
      innerRunning = true;
      await new Promise((r) => setTimeout(r, 50));
      innerRunning = false;
    });

    await new Promise((r) => setTimeout(r, 10));
    await expect(lock.run("g1", "u1", async () => undefined)).rejects.toBeInstanceOf(CasinoBusyError);

    await first;
    expect(innerRunning).toBe(false);

    await expect(lock.run("g1", "u1", async () => 42)).resolves.toBe(42);
  });

  test("allows different users concurrently", async () => {
    const lock = new CasinoLockService();
    await Promise.all([
      lock.run("g1", "u1", async () => 1),
      lock.run("g1", "u2", async () => 2),
    ]).then((values) => expect(values).toEqual([1, 2]));
  });
});
