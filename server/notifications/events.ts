/**
 * Event-driven (transactional) notifications — the bridge between domain actions
 * (a member accepting an invite, a role change, a removal) and the notification
 * fan-out. Unlike the daily reminder sweep, these fire in response to a single
 * user action and target one recipient.
 *
 * Every helper is BEST-EFFORT: it never throws and never blocks the action that
 * triggered it. A delivery failure is logged, not propagated — losing a courtesy
 * notification must never roll back a role change or an invite acceptance.
 */

import { logger } from "../_core/logger";
import { notify } from "./index";
import type { ReminderMessage } from "./types";

async function notifySafe(
  userId: number,
  message: ReminderMessage
): Promise<void> {
  try {
    await notify(userId, message);
  } catch (err) {
    logger.error(
      { userId, dedupeKey: message.dedupeKey, err: (err as Error).message },
      "[notify-event] delivery failed"
    );
  }
}

/** Tell the inviter that someone accepted their workspace invitation. */
export async function notifyInviteAccepted(
  inviterUserId: number,
  params: { accepterName: string; tenantName: string; tenantId: number }
): Promise<void> {
  await notifySafe(inviterUserId, {
    dedupeKey: `invite-accepted:${params.tenantId}:${inviterUserId}:${Date.now()}`,
    category: "system",
    titleKey: "inviteAccepted.title",
    bodyKey: "inviteAccepted.body",
    params: { name: params.accepterName, tenant: params.tenantName },
    url: "/settings",
  });
}

/** Tell a member their role in a workspace changed. */
export async function notifyMemberRoleChanged(
  userId: number,
  params: { tenantName: string; tenantId: number; role: string }
): Promise<void> {
  await notifySafe(userId, {
    dedupeKey: `member-role-changed:${params.tenantId}:${userId}:${Date.now()}`,
    category: "system",
    titleKey: "memberRoleChanged.title",
    bodyKey: "memberRoleChanged.body",
    params: { tenant: params.tenantName, role: params.role },
    url: "/settings",
  });
}

/** Tell a member they were removed from a workspace. */
export async function notifyMemberRemoved(
  userId: number,
  params: { tenantName: string; tenantId: number }
): Promise<void> {
  await notifySafe(userId, {
    dedupeKey: `member-removed:${params.tenantId}:${userId}:${Date.now()}`,
    category: "system",
    titleKey: "memberRemoved.title",
    bodyKey: "memberRemoved.body",
    params: { tenant: params.tenantName },
    url: "/settings",
  });
}
