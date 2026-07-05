export function parseButtonId(customId: string, prefix: string): string[] | null {
  if (!customId.startsWith(`${prefix}:`)) return null;
  return customId.slice(prefix.length + 1).split(":");
}

export function buildButtonId(prefix: string, ...parts: string[]): string {
  return [prefix, ...parts].join(":");
}
