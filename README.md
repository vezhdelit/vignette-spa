# vignette-spa

A mobile-first SPA re-implementation of the vignette.id app UI (Home /
Vignettes / Support / Account tabs, buy flow, order management) on top of the
**public API** of the `vignette.id` backend — all `/public/auth/*` and
`/public/me/*` routes, plus the `/public/catalog/*` product catalog.

**Stack:** Vite + React 19 + TypeScript · TanStack Query (server state) ·
Zustand (auth session only) · Tailwind CSS v4 · shadcn/ui (radix preset) ·
react-router v7 · sonner (toasts) · lucide icons.

## Run

```bash
pnpm install
pnpm dev        # http://localhost:3300
pnpm build      # tsc -b && vite build
```

## Configuration (`.env.local`)

```bash
VITE_VIGNETTE_API_BASE=https://vignette.id/api   # or http://localhost:3000/api
VITE_VIGNETTE_CLIENT_ID=vgc_...                  # a PUBLIC auth client (X-Client-Id)
```

The API sends `Access-Control-Allow-Origin: *`, so a direct base URL works
from the browser. If `VITE_VIGNETTE_API_BASE` is unset the app calls `/api`
and the Vite dev proxy forwards it to `VITE_PROXY_TARGET`
(default `https://vignette.id`).

The client id must be a **public** `auth_clients` row (created via the
dashboard); partner API keys are intentionally not supported here — this is a
pure browser SPA.

## How auth works

- On first launch the app silently creates a **guest session**
  (`POST /public/auth/guest`) so browsing and buying work immediately —
  exactly like the mobile app. Guest checkout sends the email typed in the
  order form.
- **Sign in** (Account tab) is email OTP: `POST /public/auth/otp/start` →
  `POST /public/auth/otp/verify`. Signing out falls back to a fresh guest
  session.
- Access tokens (15 min ES256 JWTs) are refreshed proactively ~30s before
  expiry and reactively on 401, single-flight, via
  `POST /public/auth/token/refresh` (rotating refresh tokens). See
  [src/lib/api.ts](src/lib/api.ts).
- Tokens persist in `localStorage` (`vignette-auth` key) through Zustand's
  `persist` middleware.

## Data layer

Every request except the auth handshake goes through TanStack Query —
`src/lib/query.ts` holds the one `QueryClient`, `src/queries/*` the hooks:

- `orders.ts` — `useOrders()` (infinite/load-more; polls every 20s while an
  order is CREATED/PENDING via `refetchInterval`), `useOrder()`,
  `useOrderStatus()` / `usePaymentStatus()` (4s poll of the slim
  `orders/:id/status` until an order leaves CREATED), and the
  create/modify/refund/transfer mutations, which patch the cached lists.
- `catalog.ts` — products + flex tiers in one query (5-min stale), with pure
  helpers `productsFor()` / `defaultFlexType()`.
- `me.ts`, `account.ts`, `push.ts` — profile, the Account tab sections
  (each section's body mounts its query only while expanded), the
  notifications inbox (list with `mark_read`, summary poll for the bell
  badge, read/unread/mark-all mutations that patch the cached pages),
  consents and web-push registration. Endpoints a guest may not call
  (`403 guest_not_allowed`) are `enabled: false` for a guest session.

Session-bound keys are `[root, <user id | "anon">, …]`, so signing in or out
starts from an empty cache; `App.tsx` drops the previous session's entries.
The only server-derived state outside Query is the session itself
(`stores/auth.ts`: tokens + the user they were issued to), because the api
client reads it synchronously to sign requests.

## Public API coverage

| Area | Endpoints | Where |
|---|---|---|
| OTP sign-in | `otp/start`, `otp/verify` | Account tab |
| Apple/Google sign-in | `nonce`, `apple/verify`, `google/verify`, `social/link-email` | Account tab (buttons render when `VITE_VIGNETTE_{GOOGLE,APPLE}_CLIENT_ID` set; 202 `email_required` → OTP-link flow) |
| Guest sessions | `auth/guest` | automatic on first launch (lazy, self-healing) |
| Tokens | `token/refresh`, `logout`, `logout-all` | api client / Account |
| Sessions | `GET auth/sessions` | Account → Devices & sessions |
| Profile | `GET /public/me` | Account header |
| Orders | `GET /public/me/orders` (page/status/scope), `GET orders/:id`, `GET orders/:id/status` | Home tab (+ pagination); `:id/status` is the 4s checkout poll |
| Buy | `POST /public/me/orders` (+ `?allow_duplication` retry) → `payment_link` | order sheet (2-step) |
| Modify / refund / transfer | `POST orders/:id/{modify,refund,transfer}` | expanded order card |
| Wallet / referrals / vehicles | `GET wallet`, `referrals`, `vehicles` | Account sections (wallet/income are **integer cents**); `vehicles` is guest-ok — a guest gets the plates from its own orders, with string ids `"<country>:<plate>"` — and feeds the order sheet's saved-plate chips |
| Notifications | `GET notifications?mark_read=true` (paginated; opening the inbox is what marks it read), `GET notifications/summary` (unread badge, polled every 60s), `POST notifications/:id/read`, `:id/unread`, `mark-all-read` | header bell → `/notifications` page; Account → Notifications section (same list) |
| Consents | `GET`/`POST`/`DELETE consents` | Account → Partner access (grant/revoke) |
| Apple Wallet | `GET apple-pass` | order card → ADD TO WALLET |
| Catalog | `GET catalog/products`, `catalog/products/flex` | Vignettes tab / order sheet |

Contract details honored (per `vignette.id/docs/auth/integration-guide.md` +
controller source): every `products[]` entry sends a fresh UUID `custom_id` —
mandatory for unpaid orders (`/me` pins `order_has_been_paid: false`) and
unique per partner; the create response's `orders[]` are slim stubs (`id`,
`custom_id`, pricing), so the app polls `GET orders/:id` for the full shape;
refresh is single-flight and never retried with the same
token after a lost response (rotation reuse revokes the family); per-period
restrictions `vin_code_required` (9/17 alnum), `driver_info_required`
(`user.user_name`/`passport_number`/`passport_country`), `from-tomorrow`
(TODAY disabled) and `disabled` (period hidden); `CREATED` = awaiting payment
(distinct card, never "processing"); `end_date` may be the string
`"YYYY-MM-DD 23:59"`; MD vignette + MD plate blocked client-side;
`Retry-After` surfaced on 429s.

## Buy flow details

- Period chips come from the product's `price` map; periods flagged
  `disabled` are hidden; `vin_code_required` makes the VIN input mandatory
  (9 or 17 alphanumerics); `driver_info_required` (Moldova) reveals a
  driver-details card and sends the `user` object.
- `PAY` posts the order and renders `payment_link` in an **in-sheet iframe
  modal** (the pay page ships `Content-Security-Policy: frame-ancestors *`
  for exactly this embedded use), while polling the slim
  `GET /public/me/orders/:id/status` every 4s in the background; the moment
  the status leaves `CREATED` the modal is replaced by the "Payment received"
  screen and the full order is fetched once via the list invalidation. Closing the modal abandons checkout (the order stays `CREATED` and
  shows as "Awaiting payment" on Home). An open-in-browser fallback sits in
  the modal header.
- Home polls the orders list every 20s while any order is CREATED/PENDING
  (the "Processing (~15m)" card) so it flips to active on its own.

## Deep links

`/vignettes?country=ro` preselects a country;
`/vignettes?product=vignette-ro-2a` opens the order sheet for that product.
