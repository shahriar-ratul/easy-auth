import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { AuditEvent } from "@/lib/auth/core/types.js";
import * as schema from "./schema.js";
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

/**
 * Plain class, no decorators — Drizzle-specific sink for `SessionStoreDeps.appendAuditEvent`
 * (registry/core/session-policy.ts) plus the RBAC/2FA/OAuth/password-reset flows, mirroring
 * the reference combo's AuditLogRepository.
 */
export class AuditLogRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async append(event: AuditEvent, opts: { remarks?: string } = {}): Promise<void> {
    await this.db.insert(schema.auditLogs).values({
      action: event.type,
      name: humanizeAction(event.type),
      userId: "userId" in event ? toIdOrNull(event.userId) : null,
      info: event,
      remarks: opts.remarks ?? null,
    });
  }

  /**
   * Newest-first, cursor-paginated (cursor = the last-seen row's `id`). The cursor row is read
   * first so the page boundary can be expressed as a row-wise comparison on the same
   * `(createdAt, id)` tuple the ordering uses — an offset would skip or repeat rows as new
   * entries land at the head of the log.
   */
  async list(filter: AuditLogListFilter): Promise<{ entries: AuditLogEntry[]; nextCursor: string | null }> {
    const limit = Math.min(filter.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const conditions: SQL[] = [];

    const userIdBig = toIdOrUndefined(filter.userId);
    if (userIdBig !== undefined) conditions.push(eq(schema.auditLogs.userId, userIdBig));
    if (filter.action) conditions.push(eq(schema.auditLogs.action, filter.action));
    if (filter.since) conditions.push(gte(schema.auditLogs.createdAt, new Date(filter.since)));
    if (filter.until) conditions.push(lte(schema.auditLogs.createdAt, new Date(filter.until)));

    if (filter.cursor) {
      const [anchor] = await this.db.select().from(schema.auditLogs).where(eq(schema.auditLogs.id, toId(filter.cursor))).limit(1);
      if (!anchor) return { entries: [], nextCursor: null };
      conditions.push(sql`(${schema.auditLogs.createdAt}, ${schema.auditLogs.id}) < (${anchor.createdAt}, ${anchor.id})`);
    }

    const rows = await this.db
      .select()
      .from(schema.auditLogs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(schema.auditLogs.createdAt), desc(schema.auditLogs.id))
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
