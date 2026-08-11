import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, lt, lte, or, type SQL } from "drizzle-orm";
import type { AuditEvent } from "@/lib/auth/core/types.js";
import { DRIZZLE_DB, type Database } from "./db.js";
import { auditLogs } from "./schema.js";
import { toId, toIdOrNull, toIdOrUndefined } from "./id.helper.js";

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  name: string;
  action: string;
  info: unknown;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogListFilter {
  userId?: string;
  action?: string;
  since?: string;
  until?: string;
  limit?: number;
  cursor?: string;
}

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

/** "role_assigned" -> "Role assigned". Derived rather than passed in, so core never has to carry display text. */
export function humanizeAction(action: string): string {
  const words = action.split("_");
  return [words[0].charAt(0).toUpperCase() + words[0].slice(1), ...words.slice(1)].join(" ");
}

@Injectable()
export class AuditLogRepository {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

  async append(event: AuditEvent, opts: { remarks?: string } = {}): Promise<void> {
    await this.db.insert(auditLogs).values({
      action: event.type,
      name: humanizeAction(event.type),
      userId: "userId" in event ? toIdOrNull(event.userId) : null,
      info: event as unknown as Record<string, unknown>,
      remarks: opts.remarks ?? null,
    });
  }

  /** Newest-first, cursor-paginated (cursor = the last-seen row's `id`). */
  async list(filter: AuditLogListFilter): Promise<{ entries: AuditLogEntry[]; nextCursor: string | null }> {
    const limit = Math.min(filter.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const conditions: SQL[] = [];
    const userIdBig = toIdOrUndefined(filter.userId);
    if (userIdBig !== undefined) conditions.push(eq(auditLogs.userId, userIdBig));
    if (filter.action) conditions.push(eq(auditLogs.action, filter.action));
    if (filter.since) conditions.push(gte(auditLogs.createdAt, new Date(filter.since)));
    if (filter.until) conditions.push(lte(auditLogs.createdAt, new Date(filter.until)));

    // `(createdAt, id) < (cursor.createdAt, cursor.id)`, spelled out so both halves of the
    // ordering key are compared — the same rows Prisma's `cursor`/`skip: 1` would skip.
    if (filter.cursor) {
      const [anchor] = await this.db
        .select({ id: auditLogs.id, createdAt: auditLogs.createdAt })
        .from(auditLogs)
        .where(eq(auditLogs.id, toId(filter.cursor)))
        .limit(1);
      if (!anchor) return { entries: [], nextCursor: null };
      conditions.push(or(lt(auditLogs.createdAt, anchor.createdAt), and(eq(auditLogs.createdAt, anchor.createdAt), lt(auditLogs.id, anchor.id)))!);
    }

    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      entries: page.map((row) => ({
        id: row.id.toString(),
        userId: row.userId?.toString() ?? null,
        name: row.name,
        action: row.action,
        info: row.info,
        remarks: row.remarks,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      nextCursor: hasMore ? page[page.length - 1].id.toString() : null,
    };
  }
}
