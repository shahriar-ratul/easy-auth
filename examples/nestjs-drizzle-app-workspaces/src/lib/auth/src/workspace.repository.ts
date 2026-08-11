import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, inArray } from "drizzle-orm";
import { DRIZZLE_DB, type Database } from "./db.js";
import { provisionDefaultRoles, WORKSPACE_CREATOR_ROLES } from "./rbac.defaults.js";
import { RbacRepository } from "./rbac.repository.js";
import { roleMember, roles, users, workspaceMembers, workspaces } from "./schema.js";
import { toId } from "./id.helper.js";

export interface WorkspaceSummary {
  id: string;
  name: string;
  createdAt: string;
  /** The calling user's role slugs in this workspace. */
  roles: string[];
}

export interface MembershipSummary {
  memberId: string;
  userId: string;
  email: string;
  roles: string[];
  createdAt: string;
}

@Injectable()
export class WorkspaceRepository {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    @Inject(RbacRepository) private readonly rbac: RbacRepository,
  ) {}

  /**
   * Creates a workspace, its creator's admin membership, *and* that workspace's default roles —
   * all in one transaction, so a workspace is never left without an administrator.
   *
   * The role provisioning is not optional garnish. `roles` is unique per `[workspaceId, slug]`, so
   * a new workspace genuinely has no role rows: without them the creator's membership would point
   * at nothing, resolve to zero permissions, and lock them out of the workspace they had just made
   * the instant any route enforced a permission. The seeder only provisions the workspace *it*
   * creates, so this path has to provision its own — from the same definition, which is why both
   * call `provisionDefaultRoles` rather than each keeping a copy of the table.
   */
  async create(userId: string, name: string): Promise<WorkspaceSummary> {
    const userIdBig = toId(userId);
    const workspace = await this.db.transaction(async (tx) => {
      const [created] = await tx.insert(workspaces).values({ name, createdBy: userIdBig, updatedBy: userIdBig }).returning();
      await provisionDefaultRoles(tx, created.id);

      const creatorRoles = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.workspaceId, created.id), inArray(roles.slug, WORKSPACE_CREATOR_ROLES)));
      const [member] = await tx.insert(workspaceMembers).values({ workspaceId: created.id, userId: userIdBig }).returning({ id: workspaceMembers.id });
      if (creatorRoles.length) {
        await tx.insert(roleMember).values(creatorRoles.map((role) => ({ memberId: member.id, roleId: role.id })));
      }
      return created;
    });
    return {
      id: workspace.id.toString(),
      name: workspace.name,
      createdAt: workspace.createdAt.toISOString(),
      roles: [...WORKSPACE_CREATOR_ROLES].sort(),
    };
  }

  async listForUser(userId: string): Promise<WorkspaceSummary[]> {
    const memberships = await this.db
      .select({
        memberId: workspaceMembers.id,
        memberCreatedAt: workspaceMembers.createdAt,
        id: workspaces.id,
        name: workspaces.name,
        createdAt: workspaces.createdAt,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, and(eq(workspaces.id, workspaceMembers.workspaceId), eq(workspaces.isDeleted, false)))
      .where(eq(workspaceMembers.userId, toId(userId)))
      .orderBy(asc(workspaceMembers.createdAt));

    const rolesByMember = await this.rolesByMember(memberships.map((m) => m.memberId));
    return memberships.map((m) => ({
      id: m.id.toString(),
      name: m.name,
      createdAt: m.createdAt.toISOString(),
      roles: (rolesByMember.get(m.memberId.toString()) ?? []).sort(),
    }));
  }

  async listMembers(workspaceId: string): Promise<MembershipSummary[]> {
    const rows = await this.db
      .select({
        memberId: workspaceMembers.id,
        userId: workspaceMembers.userId,
        createdAt: workspaceMembers.createdAt,
        email: users.email,
      })
      .from(workspaceMembers)
      .innerJoin(users, and(eq(users.id, workspaceMembers.userId), eq(users.isDeleted, false)))
      .where(eq(workspaceMembers.workspaceId, toId(workspaceId)))
      .orderBy(asc(workspaceMembers.createdAt));

    const rolesByMember = await this.rolesByMember(rows.map((r) => r.memberId));
    return rows.map((row) => ({
      memberId: row.memberId.toString(),
      userId: row.userId.toString(),
      email: row.email,
      roles: (rolesByMember.get(row.memberId.toString()) ?? []).sort(),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /**
   * Adds an existing user by email — there is no invite/email flow in this library, that is the
   * consuming app's job. With no roles named, the new membership gets whichever of this
   * workspace's roles are flagged `isDefault`, not a slug spelled in code.
   */
  async addMember(workspaceId: string, email: string, roleSlugs?: string[]): Promise<MembershipSummary> {
    const workspaceIdBig = toId(workspaceId);
    const [user] = await this.db.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, email)).limit(1);
    if (!user) throw new NotFoundException("no user with that email");

    const [existing] = await this.db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.userId, user.id), eq(workspaceMembers.workspaceId, workspaceIdBig)))
      .limit(1);
    if (existing) throw new ConflictException("already a member of this workspace");

    const granted = await this.db
      .select({ id: roles.id, slug: roles.slug })
      .from(roles)
      .where(
        roleSlugs
          ? and(eq(roles.workspaceId, workspaceIdBig), inArray(roles.slug, roleSlugs))
          : and(eq(roles.workspaceId, workspaceIdBig), eq(roles.isDefault, true), eq(roles.isActive, true)),
      );
    const unknown = (roleSlugs ?? []).filter((slug) => !granted.some((role) => role.slug === slug));
    if (unknown.length) throw new NotFoundException(`role(s) not defined in this workspace: ${unknown.join(", ")}`);

    const member = await this.db.transaction(async (tx) => {
      const [created] = await tx.insert(workspaceMembers).values({ workspaceId: workspaceIdBig, userId: user.id }).returning();
      if (granted.length) await tx.insert(roleMember).values(granted.map((role) => ({ memberId: created.id, roleId: role.id })));
      return created;
    });

    return {
      memberId: member.id.toString(),
      userId: user.id.toString(),
      email: user.email,
      roles: granted.map((role) => role.slug).sort(),
      createdAt: member.createdAt.toISOString(),
    };
  }

  async removeMember(workspaceId: string, memberId: string): Promise<void> {
    const workspaceIdBig = toId(workspaceId);
    const memberIdBig = toId(memberId);
    const [member] = await this.db
      .select({ id: workspaceMembers.id, userId: workspaceMembers.userId, workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.id, memberIdBig))
      .limit(1);
    if (!member || member.workspaceId !== workspaceIdBig) throw new NotFoundException("member not found in this workspace");

    // Role assignments and direct grants belong to the membership, so they go with it — that is
    // the point of hanging them off the member row. `onDelete: "cascade"` on both join tables is
    // what makes that a database guarantee rather than two deletes someone has to remember.
    await this.db.delete(workspaceMembers).where(eq(workspaceMembers.id, memberIdBig));
    // A removed member must lose access on their very next request, so their entry has to become
    // unreachable — the resolution that replaces it returns "not a member", which is never cached.
    await this.rbac.invalidateMember(member.userId.toString(), workspaceId);
  }

  /** One read for a page's role assignments rather than one per membership. */
  private async rolesByMember(memberIds: bigint[]): Promise<Map<string, string[]>> {
    if (!memberIds.length) return new Map();
    const rows = await this.db
      .select({ memberId: roleMember.memberId, slug: roles.slug })
      .from(roleMember)
      .innerJoin(roles, eq(roles.id, roleMember.roleId))
      .where(inArray(roleMember.memberId, memberIds));

    const byMember = new Map<string, string[]>();
    for (const row of rows) {
      const key = row.memberId.toString();
      byMember.set(key, [...(byMember.get(key) ?? []), row.slug]);
    }
    return byMember;
  }
}
