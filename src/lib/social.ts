/**
 * Web SDK glue for Apple/Google sign-in (the id_token/identity_token exchange
 * against POST /public/auth/{apple,google}/verify — not a redirect flow).
 * Ported from vignette-auth-tester-spa/src/lib/social.js, which carries two
 * hard-won rules:
 *
 * 1. Apple's popup only survives when `AppleID.auth.signIn()` is the FIRST
 *    thing the click handler does — any `await` before it (even a quick nonce
 *    fetch) drops the "real tap" flag and the popup dies as
 *    popup_blocked_by_browser. So all async prep (SDK load, nonce hash,
 *    init()) happens ahead of time via initAppleSignIn(), and the click
 *    handler calls signInWithApple() synchronously.
 * 2. Nonces are single-use server-side (consumed before the token is even
 *    checked), so re-arm with a fresh nonce after EVERY attempt — success,
 *    failure, or cancel.
 */

export const GOOGLE_CLIENT_ID: string =
  import.meta.env.VITE_VIGNETTE_GOOGLE_CLIENT_ID || ""
export const APPLE_CLIENT_ID: string =
  import.meta.env.VITE_VIGNETTE_APPLE_CLIENT_ID || ""
export const APPLE_REDIRECT_URI: string =
  import.meta.env.VITE_VIGNETTE_APPLE_REDIRECT_URI ||
  (typeof window !== "undefined" ? `${window.location.origin}/account` : "")

const GOOGLE_SDK_SRC = "https://accounts.google.com/gsi/client"
const APPLE_SDK_SRC =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google?: any
    AppleID?: any
  }
}

const scriptPromises = new Map<string, Promise<void>>()

function loadScript(src: string): Promise<void> {
  const cached = scriptPromises.get(src)
  if (cached) return cached
  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`
    )
    if (existing) {
      if (existing.dataset.loaded === "true") resolve()
      existing.addEventListener("load", () => resolve())
      existing.addEventListener("error", () =>
        reject(new Error(`Failed to load ${src}`))
      )
      return
    }
    const el = document.createElement("script")
    el.src = src
    el.async = true
    el.onload = () => {
      el.dataset.loaded = "true"
      resolve()
    }
    el.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(el)
  })
  scriptPromises.set(src, promise)
  return promise
}

// api/services/auth/apple.js#nonceMatches accepts the raw nonce or
// sha256(nonce) hex — Apple's web JS flow embeds what you pass verbatim, so
// pass the hash and send the raw value to /apple/verify.
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  )
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Renders Google's own button into `container`, armed with `nonce` (baked
 * into initialize() — re-call with a fresh nonce to re-arm).
 */
export async function renderGoogleButton(
  container: HTMLElement,
  { nonce, onCredential }: { nonce: string; onCredential: (idToken: string) => void }
): Promise<void> {
  if (!GOOGLE_CLIENT_ID) throw new Error("Google sign-in is not configured")
  await loadScript(GOOGLE_SDK_SRC)
  const google = window.google
  if (!google?.accounts?.id) {
    throw new Error("Google Identity Services failed to load")
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    nonce,
    callback: (response: { credential: string }) =>
      onCredential(response.credential),
  })
  container.innerHTML = ""
  google.accounts.id.renderButton(container, {
    type: "standard",
    theme: "outline",
    shape: "pill",
    size: "large",
    text: "continue_with",
    logo_alignment: "center",
    width: Math.min(Math.max(container.clientWidth || 320, 200), 400),
  })
}

/** All async Apple prep — call on mount and again after every attempt. */
export async function initAppleSignIn(nonce: string): Promise<void> {
  if (!APPLE_CLIENT_ID) throw new Error("Apple sign-in is not configured")
  await loadScript(APPLE_SDK_SRC)
  if (!window.AppleID?.auth) throw new Error("Apple JS SDK failed to load")
  window.AppleID.auth.init({
    clientId: APPLE_CLIENT_ID,
    scope: "name email",
    redirectURI: APPLE_REDIRECT_URI,
    usePopup: true,
    nonce: await sha256Hex(nonce),
  })
}

/**
 * MUST be the first statement of the click handler — nothing awaited before
 * it. Resolves with the identity_token, or null if Apple returned none.
 * Rejects with { error: "popup_closed_by_user" } on cancel.
 */
export function signInWithApple(): Promise<string | null> {
  if (!window.AppleID?.auth) {
    return Promise.reject(
      new Error("Apple sign-in is still loading — try again in a moment")
    )
  }
  return window.AppleID.auth
    .signIn()
    .then(
      (response: { authorization?: { id_token?: string } }) =>
        response?.authorization?.id_token || null
    )
}

export function isAppleCancel(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { error?: string }).error === "popup_closed_by_user"
  )
}
