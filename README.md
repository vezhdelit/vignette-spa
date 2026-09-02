# vignette-spa

A mobile-first SPA re-implementation of the vignette.id app UI (Home /
Vignettes / Support / Account tabs, buy flow, order management) on top of the
**public API** of the `vignette.id` backend — all `/public/auth/*` and
`/public/me/*` routes, plus the `/public/catalog/*` product catalog.

**Stack:** Vite + React 19 + TypeScript · Zustand (state) · Tailwind CSS v4 ·
shadcn/ui (radix preset) · react-router v7 · sonner (toasts) · lucide icons.

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

## Public API coverage

| Area | Endpoints | Where |
|---|---|---|
| OTP sign-in | `otp/start`, `otp/verify` | Account tab |
| Apple/Google sign-in | `nonce`, `apple/verify`, `google/verify`, `social/link-email` | Account tab (buttons render when `VITE_VIGNETTE_{GOOGLE,APPLE}_CLIENT_ID` set; 202 `email_required` → OTP-link flow) |
| Guest sessions | `auth/guest` | automatic on first launch (lazy, self-healing) |
| Tokens | `token/refresh`, `logout`, `logout-all` | api client / Account |
| Sessions | `GET auth/sessions` | Account → Devices & sessions |
| Profile | `GET /public/me` | Account header |
| Orders | `GET /public/me/orders` (page/status/scope), `GET orders/:id` | Home tab (+ pagination, status polling) |
| Buy | `POST /public/me/orders` (+ `?allow_duplication` retry) → `payment_link` | order sheet (2-step) |
| Modify / refund / transfer | `POST orders/:id/{modify,refund,transfer}` | expanded order card |
| Wallet / referrals / vehicles | `GET wallet`, `referrals`, `vehicles` | Account sections (wallet/income are **integer cents**) |
| Notifications | `GET notifications` (paginated, implicit mark-read) | Account section |
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
- `PAY` posts the order, opens `payment_link` in a new tab, and polls
  `GET /public/me/orders/:id` every 4s until the status leaves `CREATED`,
  then shows the "Payment received" screen.
- Home polls the orders list every 20s while any order is CREATED/PENDING
  (the "Processing (~15m)" card) so it flips to active on its own.

## Deep links

`/vignettes?country=ro` preselects a country;
`/vignettes?product=vignette-ro-2a` opens the order sheet for that product.
