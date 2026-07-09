import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let client: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb(databaseUrl: string) {
  if (!db) {
    client = postgres(databaseUrl, { max: 10, connect_timeout: 10 });
    db = drizzle(client, { schema });
  }
  return db;
}

export async function closeDb() {
  if (client) {
    await client.end();
    client = null;
    db = null;
  }
}

export type Database = ReturnType<typeof getDb>;
export type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
