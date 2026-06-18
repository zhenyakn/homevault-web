import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  router,
  publicProcedure,
  protectedProcedure,
  tenantProcedure,
  tenantAdminProcedure,
} from "./_core/trpc";
import * as db from "./db";
import { generateToken, hashToken } from "./auth/password";
import { sendInviteEmail } from "./auth/email";

// Invitations expire after 7 days.
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const inviteRoleEnum = z.enum(["admin", "member", "viewer"]);

/**
 * Tenant/workspace endpoints. Read surface for the active tenant plus the
 * invite lifecycle (create/list/revoke by admins; accept by the invitee).
 * Member-management mutations land with the in-app tenant settings UI.
 */
export const tenantRouter = router({
  // The tenants the current user belongs to, with their role in each.
  list: tenantProcedure.query(async ({ ctx }) => {
    return db.getTenantsForUser(ctx.user.id);
  }),

  // The tenant the current request resolved to.
  current: tenantProcedure.query(async ({ ctx }) => {
    const tenant = await db.getTenantById(ctx.tenantId);
    return tenant ? { ...tenant, role: ctx.tenantRole } : null;
  }),

  // Members of the active tenant. Owner/admin only.
  members: tenantAdminProcedure.query(async ({ ctx }) => {
    return db.getMembersOfTenant(ctx.tenantId);
  }),

  // Public preview of an invite (shown on the accept-invite screen before the
  // user signs in / registers). Returns null for an invalid/expired token so
  // the UI can show a friendly "this link is no longer valid" message.
  inviteInfo: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const invite = await db.getLiveInviteByTokenHash(hashToken(input.token));
      if (!invite) return null;
      const tenant = await db.getTenantById(invite.tenantId);
      return {
        tenantName: tenant?.name ?? "a workspace",
        email: invite.email,
        role: invite.role,
      };
    }),

  invites: router({
    // Pending invitations for the active tenant (owner/admin only).
    list: tenantAdminProcedure.query(async ({ ctx }) => {
      const rows = await db.listPendingInvites(ctx.tenantId);
      // Never expose the token hash to the client.
      return rows.map(r => ({
        id: r.id,
        email: r.email,
        role: r.role,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
      }));
    }),

    // Invite someone to the active tenant by email. Emails a tokenised accept
    // link (best-effort); the raw token only lives in that link.
    create: tenantAdminProcedure
      .input(
        z.object({
          email: z.string().trim().toLowerCase().email(),
          role: inviteRoleEnum,
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { raw, hash } = generateToken();
        await db.createInvite({
          tenantId: ctx.tenantId,
          email: input.email,
          role: input.role,
          tokenHash: hash,
          invitedByUserId: ctx.user.id,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        });
        const tenant = await db.getTenantById(ctx.tenantId);
        await sendInviteEmail(input.email, raw, tenant?.name ?? "HomeVault");
        await db.logAudit({
          actorUserId: ctx.user.id,
          tenantId: ctx.tenantId,
          action: "invite.created",
          targetType: "email",
          targetId: input.email,
          metadata: { role: input.role },
        });
        return { success: true as const };
      }),

    // Revoke a pending invite.
    revoke: tenantAdminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await db.revokeInvite(input.id, ctx.tenantId);
        await db.logAudit({
          actorUserId: ctx.user.id,
          tenantId: ctx.tenantId,
          action: "invite.revoked",
          targetType: "invite",
          targetId: String(input.id),
        });
        return { success: true as const };
      }),

    // Accept an invite as an already-signed-in user. (A brand-new user accepts
    // by passing the same token to auth.register.)
    accept: protectedProcedure
      .input(z.object({ token: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const invite = await db.getLiveInviteByTokenHash(
          hashToken(input.token)
        );
        if (!invite) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This invitation is invalid or has expired",
          });
        }
        // Per-tenant member quota (NULL = unlimited).
        const quotaTenant = await db.getTenantById(invite.tenantId);
        if (quotaTenant?.maxMembers != null) {
          const count = await db.countActiveMembers(invite.tenantId);
          if (count >= quotaTenant.maxMembers) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `This workspace has reached its limit of ${quotaTenant.maxMembers} member${quotaTenant.maxMembers === 1 ? "" : "s"}.`,
            });
          }
        }
        await db.addMember({
          tenantId: invite.tenantId,
          userId: ctx.user.id,
          role: invite.role,
          invitedByUserId: invite.invitedByUserId ?? undefined,
        });
        await db.markInviteAccepted(invite.id);
        await db.logAudit({
          actorUserId: ctx.user.id,
          tenantId: invite.tenantId,
          action: "invite.accepted",
          targetType: "user",
          targetId: String(ctx.user.id),
          metadata: { role: invite.role },
        });
        const tenant = await db.getTenantById(invite.tenantId);
        return {
          tenantId: invite.tenantId,
          tenantName: tenant?.name ?? null,
        };
      }),
  }),

  // ── Member management (owner/admin) ──────────────────────────────────────────
  // Change a member's role. Guards against demoting the last remaining owner so
  // a tenant can never be left without one.
  setMemberRole: tenantAdminProcedure
    .input(
      z.object({
        userId: z.number().int(),
        role: z.enum(["owner", "admin", "member", "viewer"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const members = await db.getMembersOfTenant(ctx.tenantId);
      const target = members.find(m => m.userId === input.userId);
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      }
      const owners = members.filter(m => m.role === "owner");
      if (
        target.role === "owner" &&
        input.role !== "owner" &&
        owners.length <= 1
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A workspace must keep at least one owner",
        });
      }
      await db.setMemberRole(ctx.tenantId, input.userId, input.role);
      await db.logAudit({
        actorUserId: ctx.user.id,
        tenantId: ctx.tenantId,
        action: "member.role_changed",
        targetType: "user",
        targetId: String(input.userId),
        metadata: { role: input.role },
      });
      return { success: true as const };
    }),

  // Remove a member from the tenant. Cannot remove the last owner.
  removeMember: tenantAdminProcedure
    .input(z.object({ userId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const members = await db.getMembersOfTenant(ctx.tenantId);
      const target = members.find(m => m.userId === input.userId);
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      }
      const owners = members.filter(m => m.role === "owner");
      if (target.role === "owner" && owners.length <= 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A workspace must keep at least one owner",
        });
      }
      await db.removeMember(ctx.tenantId, input.userId);
      await db.logAudit({
        actorUserId: ctx.user.id,
        tenantId: ctx.tenantId,
        action: "member.removed",
        targetType: "user",
        targetId: String(input.userId),
      });
      return { success: true as const };
    }),
});
