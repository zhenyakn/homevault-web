/**
 * useMockNotifications — Phase 1 shared in-memory store.
 *
 * A tiny external store (no backend) shared by the header NotificationCenter and
 * the Settings → Notifications page, so a "Send test" in Settings shows up in the
 * bell, and read-state stays in sync across both. Built on useSyncExternalStore
 * to avoid wiring a context provider into App.tsx. Resets on reload — fine for a
 * preview. Swap for tRPC queries in Phase 2.
 */

import { useSyncExternalStore } from "react";
import {
  mockChannels,
  mockNotifications,
  type ChannelKey,
  type MockChannel,
  type MockNotification,
  type NotificationCategory,
} from "@/lib/mockNotifications";

type State = {
  notifications: MockNotification[];
  channels: MockChannel[];
};

let state: State = {
  // Clone so the store owns its arrays and the seed module stays immutable.
  notifications: mockNotifications.map(n => ({ ...n })),
  channels: mockChannels.map(c => ({ ...c })),
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(l => l());
}

function setState(next: State) {
  state = next;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

let idCounter = 0;
const nextId = () => `local-${Date.now()}-${idCounter++}`;

// ─── Actions ────────────────────────────────────────────────────────────────

export function markRead(id: string) {
  setState({
    ...state,
    notifications: state.notifications.map(n =>
      n.id === id ? { ...n, read: true } : n
    ),
  });
}

export function markAllRead() {
  setState({
    ...state,
    notifications: state.notifications.map(n => ({ ...n, read: true })),
  });
}

export function pushNotification(
  n: Omit<MockNotification, "id" | "minutesAgo" | "read"> & {
    read?: boolean;
  }
) {
  const item: MockNotification = {
    id: nextId(),
    minutesAgo: 0,
    read: n.read ?? false,
    category: n.category,
    title: n.title,
    body: n.body,
    url: n.url,
  };
  setState({ ...state, notifications: [item, ...state.notifications] });
}

export function setChannelEnabled(key: ChannelKey, enabled: boolean) {
  setState({
    ...state,
    channels: state.channels.map(c => (c.key === key ? { ...c, enabled } : c)),
  });
}

export function setChannelDestination(key: ChannelKey, destination: string) {
  setState({
    ...state,
    channels: state.channels.map(c =>
      c.key === key ? { ...c, destination } : c
    ),
  });
}

export function setChannelConfigured(key: ChannelKey, configured: boolean) {
  setState({
    ...state,
    channels: state.channels.map(c =>
      c.key === key ? { ...c, configured } : c
    ),
  });
}

/** Category used when a "Send test" notification is generated. */
export const TEST_CATEGORY: NotificationCategory = "system";

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function useMockNotifications() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useUnreadCount() {
  const { notifications } = useMockNotifications();
  return notifications.filter(n => !n.read).length;
}
