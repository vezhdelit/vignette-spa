# vignette-spa

A mobile-first SPA re-implementation of the vignette.id app UI (Home /
Vignettes / Support / Account tabs, buy flow, order management) on top of the
**public API** of the `vignette.id` backend — all `/public/auth/*` and
`/public/me/*` routes, plus the `/public/catalog/*` product catalog.

**Stack:** Vite + React 19 + TypeScript · TanStack Query (server state) ·
Zustand (auth session + device preferences) · Tailwind CSS v4 · shadcn/ui
(radix preset) · react-router v7 · sonner (toasts) · lucide icons · i18n with
no dependency (`Intl` + a dictionary, see below).

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

> The `/public/vehicles/*` endpoints need the API's CORS preflight fix
> (`api/index.js` answering `OPTIONS` with 204). They are registered in
> `routes/public.js` above its partner-key middleware, which used to answer
> the preflight with 401 — reachable from a server, unreachable from a
> browser. Against an API without that fix the plate rules, plate validation
> and vehicle lookup silently do nothing (the form falls back to the
> length-only check, `Next` proceeds, the lookup button never appears).

## Languages

The UI ships in **English, Ukrainian, Russian, Polish and German**. English is
the source and the fallback; the rest are `src/i18n/locales/<lang>.json`.

- **The dictionary is the contract.** `src/i18n/locales/en.ts` holds every
  string the app shows, and `MessageKey` is `keyof typeof en` — a key that
  isn't there is a compile error at the call site. A translation may be
  partial: a missing key renders the English text, never a blank or a raw key.
- **Components read copy through `useT()`** (`const { t } = useT()`), which
  subscribes, so a language switch re-renders them. The bare `t()` is for
  module-level helpers, formatters and toasts; `App` also subscribes at the
  root, so the whole tree re-renders on a switch.
- **Only the active language is downloaded.** The translation files are
  `import.meta.glob` dynamic imports — one ~6 kB gzipped chunk per language.
  Dropping a new `<lang>.json` in registers it: `SUPPORTED_LANGUAGES` and the
  Account picker are derived from the glob, there is no list to edit.
- **`Intl` does the parts a dictionary can't.** Plural categories
  (`Intl.PluralRules` — "10 днів" vs "1 день" is a data decision, not a
  string), country names (`Intl.DisplayNames`, so no country list is
  translated by hand), month names, and decimal separators ("20,55 €" in uk,
  "20.55 €" in en). English formats as `en-GB`, deliberately: plain `en`
  means US date order, and this app has always shown 10 Sep 2026.
- **The API is asked for the same language.** `apiLanguage()` feeds `?lang=`
  on `GET /public/vehicles/plate-rules` and `POST /public/vehicles/validate`,
  so the plate hints the server writes match the field they sit under; the
  plate-rules query key and its `localStorage` copy are per language. Order,
  promo and action messages come back in that language too.
- **First launch follows the device** (`navigator.languages`, with the same
  aliases the API accepts: `ua`→`uk`, `cz`→`cs`, …). Account → Language
  overrides it and persists (device-local, like the currency); "Match my
  device" clears the override. `document.documentElement.lang` follows.
- The language resolves **before the first paint** (`initI18n()` is awaited in
  `main.tsx`), so the app never renders English and then flips.
- **Push notifications are translated on the device too**, from the API's own
  catalog rather than this dictionary. A push, and every inbox row, carries
  the English sentence plus `data.loc` — `notifications.<type>.*` locale keys and raw
  arguments (vignette.id `docs/push/ios-integration.md` §3). `src/lib/push-catalog.ts`
  fetches `GET /public/locales/<lang>?prefix=notifications` for the active language
  (again on every switch), persists it, renders the inbox rows per field
  (a key the catalog lacks keeps the English, never a raw key), and writes
  the catalog into the Cache API for `public/sw.js`, which shows the OS banner
  and can reach nothing else. Arguments are formatted by name: `country` via
  `Intl.DisplayNames`, `expires_at` as a date in Europe/Berlin, `amount`/`bonus`
  cents with two decimals. The worker's `formatArg` is the twin of the page's —
  change both.

Not translated on purpose: plates, currency codes, product names
(`Vignette 2A`), the session's device name (the API stores it once, and it is
read from other devices in their own language), and the two dev-only Account
panels.

### Adding or changing copy

1. Add the key + English text to `src/i18n/locales/en.ts`. It compiles
   everywhere immediately, rendering English in every language.
2. Add it to each `<lang>.json`. Account → **"Translations (dev)"** shows the
   active language's coverage and names the missing (or now-unknown) keys.

Roughly a tenth of the strings were taken from `vignette.id/locales/*.json`
rather than translated here — this SPA re-implements that order flow, so the
site's own human translations already say the same thing, and they exist in
21 languages. The remaining 16 of those languages are therefore a data-only
change: the machinery, the picker and the coverage check need nothing.

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
  helpers `productsFor()` / `defaultFlexType()`. Keyed by the display currency
  from `stores/settings.ts` (Account → Currency): both endpoints are fetched
  with `?currency=`, which the API converts server-side (with its own
  conversion margin). The charge is always settled in EUR, so the order sheet
  also reads the EUR catalog and prints the EUR amount that will be taken
  whenever another display currency is selected.
- `vehicles.ts` — the plate endpoints (client credential only, so they are
  `auth: false` and don't wait for the session bootstrap): the plate-rules
  manifest (seeded from `localStorage` so the form validates on first paint,
  then revalidated — the endpoint ETags on its version, so a refetch is a
  304), the lookup-supported countries, and the lookup / validate mutations.
  The matcher itself is `src/lib/plate-rules.ts`.
- `promos.ts` — `POST /public/me/promos/validate`: a cached query for the
  auto-apply preview (one call per distinct order shape — the endpoint allows
  60/h per IP) and `validatePromo()` for the code the user types.
- `me.ts`, `account.ts`, `push.ts` — profile, the Account tab sections
  (each section's body mounts its query only while expanded), the
  notifications inbox (list with `mark_read`, summary poll for the bell
  badge, read/unread/mark-all mutations that patch the cached pages),
  consents and web-push registration. Endpoints a guest may not call
  (`403 guest_not_allowed`) are `enabled: false` for a guest session.
- `lib/push-catalog.ts` — the one piece of server copy outside Query: the
  `notifications.<type>.*` translations a push and an inbox row are rendered from, in a small
  persisted store (per UI language) mirrored into the Cache API for the
  service worker.

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
| Notifications | `GET notifications?mark_read=true` (paginated; opening the inbox is what marks it read), `GET notifications/summary` (unread badge, polled every 60s), `POST notifications/:id/read`, `:id/unread`, `mark-all-read` | header bell → `/notifications` page; Account → Notifications section (same list); rows render in the UI language from `data.loc` (see Languages) |
| Push copy | `GET /public/locales/:lang?prefix=notifications` | `src/lib/push-catalog.ts` — the `notifications.<type>.*` templates the inbox and `public/sw.js` render pushes from; fetched per UI language, cached for the worker |
| Consents | `GET`/`POST`/`DELETE consents` | Account → Partner access (grant/revoke) |
| Rate the app | `has_rated` / `rate_prompt` on `GET /public/me`; `POST rating` (`{ rating, comment? }` → `store_review`), `POST rating/dismissed` | one sheet (`components/rating/RateAppSheet`, opened via `stores/rating.ts`): auto after a paid checkout while `rate_prompt` is `after_purchase`; Home "Enjoying vignette.id?" card while it is `anywhere` (its ✕ = dismissed); Account → "Rate the app" row any time (manual open, never reported as a dismissal). 4–5 stars continue to `VITE_APP_STORE_REVIEW_URL` when set. Both writes patch the cached `/me`, no refetch |
| Apple Wallet | `GET apple-pass` | order card → ADD TO WALLET |
| Catalog | `GET catalog/products`, `catalog/products/flex` | Vignettes tab / order sheet |
| Promo codes | `POST /public/me/promos/validate` (`code` typed, or `code: null` for the auto campaign) + `promo_code` on `POST /me/orders` | order sheet step 2 (`components/order/PromoCodeInput`); the applied promo also shows on the expanded order card from `promo` on every order read |
| Plate rules | `GET /public/vehicles/plate-rules`, `plate-rules/vectors` | `src/lib/plate-rules.ts` validates in the form (same verdict/type/message as the server); the vectors are the dev self-check in Account → "Plate rules (dev)" |
| Plate validation | `POST /public/vehicles/validate` | the order sheet's step-1 → step-2 boundary: the server's final say, and the normalized plate it echoes is adopted |
| Vehicle lookup | `GET /public/vehicles/lookup`, `lookup/supported-countries` | "Find my vehicle" under the plate (`components/order/VehicleLookup`) — fills the VIN a RO/MD vignette needs; also in the modify drawer. Only rendered for a country the supported list names (today `ua`), so a new registry needs no release here |

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
- The plate is checked against its country's own format rules **as it is
  typed**, from the rules manifest the API serves — same verdict, error type
  and message as the server, so `Next` is only offered for a plate an order
  would accept. Under the error the form says *why*: the manifest's `explain`
  list (ordered positive expectations per country) gives the first one the
  plate misses — "A Ukrainian plate is 8 characters — two letters, four
  digits, two letters; AAAAAA has 6" — and when every piece is right but the
  arrangement isn't, the country's `hint` says what right looks like ("e.g.
  AA 1234 BB or KA 6797 MT: …"). When a `forbid` rule fired its message
  already is the why, so only the format line is added. `POST
  /public/vehicles/validate` returns the same text as `hint` on an invalid
  row, and the sheet prefers that when the server's verdict differs from the
  local one. All of this copy is **localised by the API**: the manifest and
  the validate `hint` are requested with `?lang=` set to
  `src/lib/language.ts#UI_LANGUAGE` (English until the SPA has its own i18n)
  rather than left to the browser's `Accept-Language`, so the text always
  matches the language of the field it sits under; the query key and the
  `localStorage` copy are per language. `Next` then asks `POST /public/vehicles/validate` for the
  final say and adopts the normalized plate it echoes; that call failing
  (offline, 5xx) never blocks the purchase, since order creation validates
  again anyway. Where the plate's country has a registry, "Find my vehicle"
  fills the VIN (and shows make/model/year) instead of asking the user to
  read it off the windscreen.
- A promo code can be applied on step 2. It is priced against the exact order
  (`POST /public/me/promos/validate`) and re-priced whenever the order changes
  under it — period, date, flex, plate — so a code that stopped applying is
  dropped there with the server's own message rather than at checkout. With no
  code typed the sheet asks for the auto-apply campaign and says so when one
  applies (the server would apply it either way). Promo amounts are always
  EUR: with EUR on screen the total shows the promo price with the gross
  struck through, otherwise the euro line under the total quotes what will be
  charged. A `promo_*` rejection at checkout drops the code and leaves the
  user on step 2 able to pay without it.
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
