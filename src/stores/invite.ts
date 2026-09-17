/**
 * The invite code someone arrived with, held until there is an account to
 * attach it to.
 *
 * A referral link is `/r/<code>`, and whoever follows it is almost never
 * signed in yet. The server only links an account to an inviter through
 * `POST /public/me/referrals/claim`, which needs a user token — so the code
 * has to survive sign-in. It is kept in localStorage rather than in memory
 * because the OTP round trip and the Apple/Google redirects both reload the
 * page.
 *
 * Deliberately not a Zustand store: nothing re-renders on it. It is read
 * once after sign-in by the claim effect and cleared the moment the server
 * accepts or finally refuses it.
 */

const KEY = "vignette.invite_code"

/** Codes are 11 url-safe characters; anything else is not worth storing. */
const looksLikeCode = (value: string) => /^[A-Za-z0-9_-]{8,16}$/.test(value)

export function setPendingInviteCode(code: string): void {
  const trimmed = code.trim()
  if (!looksLikeCode(trimmed)) return
  try {
    localStorage.setItem(KEY, trimmed)
  } catch {
    /* private mode / storage disabled — the invite is simply lost */
  }
}

export function getPendingInviteCode(): string | null {
  try {
    const stored = localStorage.getItem(KEY)
    return stored && looksLikeCode(stored) ? stored : null
  } catch {
    return null
  }
}

export function clearPendingInviteCode(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to do */
  }
}

/**
 * Pulls the code out of the URL the visitor landed on and remembers it:
 * `/r/<code>` (the share link) or any `?ref=<code>` / `?ref_code=<code>`
 * (what the app-store deep link carries). Returns the code when one was
 * found, so the caller can redirect off the /r/ path.
 */
export function captureInviteCodeFromUrl(): string | null {
  if (typeof window === "undefined") return null

  const { pathname, searchParams } = new URL(window.location.href)

  const fromPath = /^\/r\/([^/]+)\/?$/.exec(pathname)?.[1]
  const fromQuery = searchParams.get("ref") ?? searchParams.get("ref_code")
  const code = fromPath ?? fromQuery ?? null

  if (code && looksLikeCode(code)) {
    setPendingInviteCode(code)
    return code
  }

  return null
}
