/**
 * Dispatcher — fans a single notification out to every enabled, configured
 * channel with per-channel failure isolation, and records the outcome of each
 * attempt. Idempotency (don't resend the same dedupeKey on a channel) is handled
 * via the injected `isAlreadySent` check, so the daily sweep can run repeatedly.
 *
 * All I/O (which channels are enabled, the already-sent check, the result
 * recorder) is injected, keeping this unit-testable with fake channels.
 */

import type {
  ChannelKey,
  ChannelResult,
  NotificationChannel,
  NotificationPayload,
  Recipient,
} from "./types";

export type DispatchDeps = {
  /** All registered channel adapters. */
  channels: NotificationChannel[];
  /** Channels the recipient has opted into. */
  enabledChannels: Set<ChannelKey>;
  /** Idempotency guard — return true if this (channel, dedupeKey) already sent. */
  isAlreadySent?: (
    channel: ChannelKey,
    dedupeKey: string
  ) => boolean | Promise<boolean>;
  /** Persist the outcome (delivery log row). */
  record?: (
    result: ChannelResult & { dedupeKey: string }
  ) => void | Promise<void>;
};

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Deliver `payload` to `recipient` across all enabled+configured channels.
 * Never throws — every channel's outcome is captured as a ChannelResult.
 */
export async function dispatchNotification(
  recipient: Recipient,
  payload: NotificationPayload,
  deps: DispatchDeps
): Promise<ChannelResult[]> {
  const active = deps.channels.filter(c => deps.enabledChannels.has(c.key));

  const results = await Promise.all(
    active.map(async (channel): Promise<ChannelResult> => {
      const finish = async (r: ChannelResult): Promise<ChannelResult> => {
        if (deps.record) {
          try {
            await deps.record({ ...r, dedupeKey: payload.dedupeKey });
          } catch {
            // Recording must never break delivery reporting.
          }
        }
        return r;
      };

      try {
        if (deps.isAlreadySent) {
          const dup = await deps.isAlreadySent(channel.key, payload.dedupeKey);
          if (dup) {
            return finish({
              channel: channel.key,
              status: "skipped",
              reason: "already-sent",
            });
          }
        }

        if (!channel.isConfigured()) {
          return finish({
            channel: channel.key,
            status: "skipped",
            reason: "not-configured",
          });
        }

        if (!channel.canDeliverTo(recipient)) {
          return finish({
            channel: channel.key,
            status: "skipped",
            reason: "no-destination",
          });
        }

        await channel.send(recipient, payload);
        return finish({ channel: channel.key, status: "sent" });
      } catch (e) {
        return finish({
          channel: channel.key,
          status: "failed",
          reason: errMessage(e),
        });
      }
    })
  );

  return results;
}
