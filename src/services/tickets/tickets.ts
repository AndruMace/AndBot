import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import {
  andbotTickets,
  type AndbotTicket,
  type TicketStatus,
  type TicketType,
} from "../../db/schema";
import type { Config } from "../../config";

export class TicketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TicketError";
  }
}

export function formatTicketId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export class TicketService {
  constructor(
    private db: Database,
    private config: Config,
  ) {}

  async countOpenForUser(guildId: string, submitterId: string): Promise<number> {
    const rows = await this.db
      .select({ id: andbotTickets.id })
      .from(andbotTickets)
      .where(
        and(
          eq(andbotTickets.guildId, guildId),
          eq(andbotTickets.submitterId, submitterId),
          eq(andbotTickets.status, "open"),
        ),
      );
    return rows.length;
  }

  async submit(
    guildId: string,
    channelId: string,
    submitterId: string,
    type: TicketType,
    title: string,
    body: string,
  ): Promise<AndbotTicket> {
    const openCount = await this.countOpenForUser(guildId, submitterId);
    if (openCount >= this.config.TICKET_MAX_OPEN_PER_USER) {
      throw new TicketError(
        `You already have ${openCount} open ticket(s). Wait for a mod to review them before submitting another.`,
      );
    }

    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle || !trimmedBody) {
      throw new TicketError("Title and message cannot be empty.");
    }
    if (trimmedTitle.length > this.config.TICKET_TITLE_MAX_LENGTH) {
      throw new TicketError(`Title must be at most ${this.config.TICKET_TITLE_MAX_LENGTH} characters.`);
    }
    if (trimmedBody.length > this.config.TICKET_BODY_MAX_LENGTH) {
      throw new TicketError(`Message must be at most ${this.config.TICKET_BODY_MAX_LENGTH} characters.`);
    }

    const [ticket] = await this.db
      .insert(andbotTickets)
      .values({
        guildId,
        channelId,
        submitterId,
        type,
        title: trimmedTitle,
        body: trimmedBody,
      })
      .returning();

    return ticket!;
  }

  async listTickets(
    guildId: string,
    status: TicketStatus | "all",
    limit = 10,
  ): Promise<AndbotTicket[]> {
    const conditions = [eq(andbotTickets.guildId, guildId)];
    if (status !== "all") {
      conditions.push(eq(andbotTickets.status, status));
    }

    return this.db
      .select()
      .from(andbotTickets)
      .where(and(...conditions))
      .orderBy(desc(andbotTickets.createdAt))
      .limit(limit);
  }

  async findByShortId(guildId: string, shortId: string): Promise<AndbotTicket | null> {
    const normalized = shortId.trim().toLowerCase();
    if (!/^[0-9a-f]{8}$/i.test(normalized)) {
      return null;
    }

    const [ticket] = await this.db
      .select()
      .from(andbotTickets)
      .where(
        and(
          eq(andbotTickets.guildId, guildId),
          sql`replace(${andbotTickets.id}::text, '-', '') like ${normalized + "%"}`,
        ),
      )
      .limit(1);

    return ticket ?? null;
  }

  async review(
    ticket: AndbotTicket,
    reviewerId: string,
    status: "resolved" | "closed",
    note?: string,
  ): Promise<AndbotTicket> {
    if (ticket.status !== "open") {
      throw new TicketError(`Ticket **${formatTicketId(ticket.id)}** is already ${ticket.status}.`);
    }

    const reviewNote = note?.trim() || null;

    const [updated] = await this.db
      .update(andbotTickets)
      .set({
        status,
        reviewerId,
        reviewNote,
        updatedAt: new Date(),
      })
      .where(eq(andbotTickets.id, ticket.id))
      .returning();

    return updated!;
  }
}

export function createTicketService(db: Database, config: Config): TicketService {
  return new TicketService(db, config);
}
