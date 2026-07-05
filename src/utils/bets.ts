import type { Config } from "../config";

export class BetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BetValidationError";
  }
}

export function validateBetAmount(amount: number, config: Config): void {
  if (!Number.isInteger(amount)) {
    throw new BetValidationError("Amount must be a whole number.");
  }
  if (amount < config.MIN_BET) {
    throw new BetValidationError(`Minimum amount is ${config.MIN_BET} ${config.CURRENCY_NAME}.`);
  }
  if (amount > config.MAX_BET) {
    throw new BetValidationError(`Maximum amount is ${config.MAX_BET} ${config.CURRENCY_NAME}.`);
  }
}

export function formatCurrency(amount: number, config: Config): string {
  return `${amount.toLocaleString()} ${config.CURRENCY_NAME}`;
}
