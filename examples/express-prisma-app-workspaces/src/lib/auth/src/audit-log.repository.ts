import type { AuditEvent } from "@/lib/auth/core/types.js";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { toId, toIdOrNull, toIdOrUndefined } from "./id.helper.js";

export interface AuditLogEntry {
  id: string;
  workspaceId: string | null;
  userId: string | null;
  name: string;
  action: string;
  info: unknown;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogListFilter {
  /** Set on every workspace-scoped read, so one workspace's admins never see another's entries. */
  workspaceId?: string;
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

// Plain class, no DI container — constructed directly with a PrismaClient in
// create-auth-app.ts. Identical Prisma queries to the reference combo.
export class AuditLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * `workspaceId` is left null for events core raises (login, logout, password reset, ...) —
   * those happen to a user, not inside a workspace. Callers that *are* acting in a workspace
   * pass it, which is what scopes the admin audit-log read below.
   */
  async append(event: AuditEvent, opts: { workspaceId?: string; remarks?: string } = {}): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: event.type,
        name: humanizeAction(event.type),
        workspaceId: toIdOrNull(opts.workspaceId),
        userId: "userId" in event ? toIdOrNull(event.userId) : null,
        info: event as unknown as Prisma.InputJsonValue,
        remarks: opts.remarks ?? null,
      },
    });
  }

  /** Newest-first, cursor-paginated (cursor = the last-seen row's `id`). */
  async list(filter: AuditLogListFilter): Promise<{ entries: AuditLogEntry[]; nextCursor: string | null }> {
    const limit = Math.min(filter.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const rows = await this.prisma.auditLog.findMany({
      where: {
        workspaceId: toIdOrUndefined(filter.workspaceId),
        userId: toIdOrUndefined(filter.userId),
        action: filter.action,
        createdAt: {
          gte: filter.since ? new Date(filter.since) : undefined,
          lte: filter.until ? new Date(filter.until) : undefined,
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(filter.cursor ? { cursor: { id: toId(filter.cursor) }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      entries: page.map((row) => ({
        id: row.id.toString(),
        workspaceId: row.workspaceId?.toString() ?? null,
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
