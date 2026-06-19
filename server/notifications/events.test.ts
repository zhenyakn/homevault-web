import { describe, it, expect, vi, beforeEach } from "vitest";

// notify() is the fan-out; we only assert that the event helpers call it with a
// well-formed, recipient-targeted message and never throw on failure.
const notify = vi.fn(async () => []);
vi.mock("./index", () => ({ notify: (...a: unknown[]) => notify(...a) }));

const errorLog = vi.fn();
vi.mock("../_core/logger", () => ({
  logger: { error: (...a: unknown[]) => errorLog(...a) },
}));

import {
  notifyInviteAccepted,
  notifyMemberRoleChanged,
  notifyMemberRemoved,
} from "./events";

beforeEach(() => {
  notify.mockClear().mockResolvedValue([]);
  errorLog.mockClear();
});

describe("event-driven notifications", () => {
  it("invite accepted notifies the inviter with name + tenant", async () => {
    await notifyInviteAccepted(42, {
      accepterName: "Dana",
      tenantName: "Acme",
      tenantId: 7,
    });
    expect(notify).toHaveBeenCalledOnce();
    const [userId, msg] = notify.mock.calls[0] as [number, any];
    expect(userId).toBe(42);
    expect(msg.titleKey).toBe("inviteAccepted.title");
    expect(msg.params).toEqual({ name: "Dana", tenant: "Acme" });
    expect(msg.dedupeKey).toContain("invite-accepted:7:42:");
  });

  it("role change notifies the affected member with the new role", async () => {
    await notifyMemberRoleChanged(9, {
      tenantName: "Acme",
      tenantId: 7,
      role: "admin",
    });
    const [userId, msg] = notify.mock.calls[0] as [number, any];
    expect(userId).toBe(9);
    expect(msg.bodyKey).toBe("memberRoleChanged.body");
    expect(msg.params).toEqual({ tenant: "Acme", role: "admin" });
  });

  it("removal notifies the removed member", async () => {
    await notifyMemberRemoved(9, { tenantName: "Acme", tenantId: 7 });
    const [userId, msg] = notify.mock.calls[0] as [number, any];
    expect(userId).toBe(9);
    expect(msg.titleKey).toBe("memberRemoved.title");
  });

  it("is best-effort: a notify failure is swallowed and logged", async () => {
    notify.mockRejectedValueOnce(new Error("db down"));
    await expect(
      notifyMemberRemoved(9, { tenantName: "Acme", tenantId: 7 })
    ).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledOnce();
  });
});
