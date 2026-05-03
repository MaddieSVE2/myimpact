/**
 * Browser-side helpers for managing the user's web push subscription.
 *
 * Designed to be safe to call on platforms that don't support push:
 * `isPushSupported()` returns false on iOS Safari outside add-to-home-screen,
 * inside in-app browsers, etc. The Settings UI uses this to gracefully hide
 * push controls instead of throwing.
 */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type PushTriggerType = "streakAtRisk" | "recurringDue" | "monthlyDigest" | "challengeEnd";

export interface PushTriggerToggles {
  streakAtRisk: boolean;
  recurringDue: boolean;
  monthlyDigest: boolean;
  challengeEnd: boolean;
}

export interface PushPreferencesResponse {
  enabled: boolean;
  pausedUntil: string | null;
  triggers: PushTriggerToggles;
  subscriptions: { id: string; endpoint: string; userAgent: string | null }[];
}

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function currentPermission(): NotificationPermission {
  if (typeof Notification === "undefined") return "denied";
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

async function getPublicKey(): Promise<string> {
  const res = await fetch(`${BASE}/api/push/public-key`);
  if (!res.ok) throw new Error("Push notifications are not configured on the server.");
  const data = (await res.json()) as { publicKey?: string };
  if (!data.publicKey) throw new Error("Push public key missing.");
  return data.publicKey;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.ready;
  return reg;
}

/**
 * Ask the browser for permission, subscribe via the service worker, and
 * register the subscription with the API. Idempotent.
 */
export async function enablePush(): Promise<void> {
  if (!isPushSupported()) throw new Error("Push notifications are not supported on this device.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notifications permission was not granted.");
  }

  const reg = await getRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const publicKey = await getPublicKey();
    const keyBytes = urlBase64ToUint8Array(publicKey);
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes.buffer.slice(
        keyBytes.byteOffset,
        keyBytes.byteOffset + keyBytes.byteLength,
      ) as ArrayBuffer,
    });
  }

  const json = sub.toJSON();
  const res = await fetch(`${BASE}/api/push/subscribe`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      userAgent: navigator.userAgent,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Could not register subscription.");
  }
}

/** Unsubscribe both in the browser and on the server. */
export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const reg = await getRegistration();
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe().catch(() => undefined);
      await fetch(`${BASE}/api/push/unsubscribe`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
    }
  } catch {
    // best-effort
  }
  // Also clear all server-side subscriptions for safety.
  await fetch(`${BASE}/api/push/unsubscribe`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ all: true }),
  });
}

export async function fetchPreferences(): Promise<PushPreferencesResponse> {
  const res = await fetch(`${BASE}/api/push/preferences`, { credentials: "include" });
  if (!res.ok) throw new Error("Could not load push preferences");
  return (await res.json()) as PushPreferencesResponse;
}

export async function updatePreferences(input: {
  enabled?: boolean;
  pauseDays?: number;
  resumeNow?: boolean;
  triggers?: Partial<PushTriggerToggles>;
}): Promise<PushPreferencesResponse> {
  const res = await fetch(`${BASE}/api/push/preferences`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Could not save preferences");
  }
  return (await res.json()) as PushPreferencesResponse;
}

export async function sendTestPush(): Promise<void> {
  const res = await fetch(`${BASE}/api/push/test`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Could not send test push.");
  }
}
