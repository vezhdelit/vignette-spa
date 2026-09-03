/**
 * Browser-side half of web push — ported from
 * vignette-auth-tester-spa/src/lib/webpush.js. Deliberately no API calls in
 * here (those live with the caller, AccountPage's Push notifications
 * section). The API half of the contract (vignette.id's
 * docs/push/web-integration.md):
 *
 *   GET    /public/devices/web-push-key   -> { public_key } (or 404 not_configured)
 *   POST   /public/devices                { installation_id, platform: "web", token }
 *   DELETE /public/devices                { installation_id }
 */

// The browser-profile equivalent of the iOS app's Keychain-held
// installation_id: minted once, sent on registration AND in every
// order-create body, so this browser hears about the orders it places even
// when it registered signed-out.
const INSTALL_KEY = "vignette-spa.install"

export function getInstallationId(): string | null {
  try {
    let id = localStorage.getItem(INSTALL_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(INSTALL_KEY, id)
    }
    return id
  } catch {
    // Storage blocked (private mode with strict settings) — no stable
    // install identity, so no push registration either.
    return null
  }
}

export function webPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

// pushManager.subscribe wants the VAPID key as bytes; the API serves it in
// the standard base64url encoding.
function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register("/sw.js")
  await navigator.serviceWorker.ready
  return registration
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!webPushSupported()) return null
  const registration = await navigator.serviceWorker.getRegistration("/")
  return registration ? registration.pushManager.getSubscription() : null
}

export async function subscribe(publicKey: string): Promise<PushSubscription> {
  const registration = await ensureServiceWorker()
  const options: PushSubscriptionOptionsInit = {
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  }

  try {
    return await registration.pushManager.subscribe(options)
  } catch (err) {
    // A leftover subscription made under a DIFFERENT VAPID key blocks a new
    // one with InvalidStateError — drop it and retry once (the server key
    // changed; the old subscription is dead anyway).
    if (err instanceof DOMException && err.name === "InvalidStateError") {
      const existing = await registration.pushManager.getSubscription()
      if (existing) {
        await existing.unsubscribe()
        return registration.pushManager.subscribe(options)
      }
    }
    throw err
  }
}

// Browser-side teardown only; the caller pairs it with DELETE
// /public/devices. Returns whether there was anything to unsubscribe.
export async function unsubscribe(): Promise<boolean> {
  const subscription = await currentSubscription()
  if (subscription) {
    await subscription.unsubscribe()
  }
  return Boolean(subscription)
}
