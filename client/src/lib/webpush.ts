/**
 * Web Push client helper — registers the service worker, asks permission, and
 * creates a PushSubscription with the server's VAPID public key. Returns the
 * subscription fields the `notification.subscribeWebPush` endpoint expects.
 */

export type WebPushKeys = { endpoint: string; p256dh: string; auth: string };

export function webPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  // Build on a concrete ArrayBuffer so the type is Uint8Array<ArrayBuffer>.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bufToBase64(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Subscribe this browser to web push. Throws on unsupported browsers or denied
 * permission. Idempotent: reuses an existing subscription when present.
 */
export async function subscribeToWebPush(
  vapidPublicKey: string
): Promise<WebPushKeys> {
  if (!webPushSupported()) throw new Error("Web Push is not supported here.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission denied.");

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? bufToBase64(sub.getKey("p256dh")),
    auth: json.keys?.auth ?? bufToBase64(sub.getKey("auth")),
  };
}
