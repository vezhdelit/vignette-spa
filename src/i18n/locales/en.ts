/**
 * The source dictionary — every string the UI shows, in English.
 *
 * This file is the contract: `MessageKey` is `keyof typeof en`, so a key that
 * isn't here is a type error at the call site, and a translation file with a
 * key that isn't here is reported by the completeness check (Account →
 * "Translations (dev)"). Translations live beside it as `<lang>.json` and may
 * be partial — a missing key falls back to the English text here, never to a
 * blank or a raw key.
 *
 * Conventions:
 * - `{name}` placeholders are filled in by `t()`; keep them in translations.
 * - A value that is an OBJECT is plural-selected by `Intl.PluralRules` on
 *   `params.count` (`one` / `few` / `many` / `other` — a language uses only
 *   the categories it has; `other` is the required fallback).
 * - Plates, region codes, currency codes and product names are not words —
 *   they are never in here.
 * - Copy that the API owns (plate rules, promo and order-action messages) is
 *   NOT duplicated here: the server sends it in the requested language, see
 *   `src/i18n/index.ts#apiLanguage`.
 */
export const en = {
  /* ------------------------------------------------------------ app chrome */
  "nav.home": "Home",
  "nav.vignettes": "Vignettes",
  "nav.support": "Support",
  "nav.account": "Account",
  "bell.label": "Notifications",
  "bell.labelUnread": "Notifications, {count} unread",

  /* ---------------------------------------------------------------- common */
  "common.loading": "Loading…",
  "common.sending": "Sending…",
  "common.retry": "Retry",
  "common.loadMore": "Load more ({current}/{total})",
  "common.cancel": "Cancel",
  "common.back": "Back",
  "common.done": "Done",
  "common.notNow": "Not now",
  "common.signIn": "Sign in",
  "common.email": "Email",
  "common.somethingWrong": "Something went wrong",
  "common.retryIn": "{message} — try again in {seconds}s",

  /* ------------------------------------------------------- units & periods */
  "period.days": { one: "{count} day", other: "{count} days" },
  "period.years": { one: "{count} year", other: "{count} years" },
  /** the short unit under the big number on a period chip / order badge */
  "unit.days": { one: "day", other: "days" },
  "unit.years": { one: "year", other: "years" },

  /* ------------------------------------------------------------- home tab */
  "home.loadErrorTitle": "Couldn't load your vignettes",
  "home.loadErrorBody": "Failed to load orders",
  "home.empty.details": "Details",
  "home.empty.plate": "Plate",
  "home.empty.expires": "Expires",
  "home.empty.buy": "Buy now",
  "home.empty.note": "Your vignettes will appear here once you buy one.",
  "home.rate.title": "Enjoying vignette.id?",
  "home.rate.subtitle": "Rate the app — it takes ten seconds",

  /* ----------------------------------------------------------- order card */
  "orderCard.banner.created":
    "Awaiting payment!\nThe payment was not completed for this order",
  "orderCard.banner.pending":
    "Processing (~15m)!\nDon't drive without active vignette to avoid fines",
  "orderCard.banner.scheduled": "Scheduled — activates on the start date",
  "orderCard.banner.refunded": "Refunded",
  "orderCard.banner.expired": "Expired",
  "orderCard.completePayment": "Complete payment",
  "orderCard.transfer": "Transfer vignette",
  "orderCard.modify": "Modify vignette data",
  "orderCard.refund": "Refund",
  "orderCard.refundPercent": "Refund {percent}%",
  "orderCard.uniqueId": "E-vignette unique identificator",
  "orderCard.receipt": "Receipt",
  "orderCard.evignette": "E-vignette",
  "orderCard.addTo": "Add to",
  "orderCard.wallet": "Wallet",
  "orderCard.guestNote":
    "Sign in on the Account tab to transfer, modify or add to Wallet.",
  "orderCard.from": "From",
  "orderCard.until": "until",
  "orderCard.vignetteOf": "Vignette of {country}",
  "orderCard.detailsLabel": "Details",
  "orderCard.promo.cashbackPending": "cashback after payment",
  "orderCard.promo.cashbackGranted": "cashback credited to your wallet",
  "orderCard.promo.cashbackReversed": "cashback reversed after the refund",
  "orderCard.promoFallback": "Promo",

  /* ------------------------------------------------- modify / transfer / refund */
  "modify.title": "Change vignette data",
  "modify.description": "The car plate can be changed before the vignette activates.",
  "modify.plate": "Registration plate",
  "modify.plateCountry": "Plate country",
  "modify.vin": "VIN code",
  "modify.vinPlaceholder": "9 or 17-character VIN",
  "modify.vinRequired": "This product requires a VIN code (9 or 17 characters).",
  "modify.confirm":
    "I confirm that the changes were made correctly and I am responsible for their accuracy.",
  "modify.save": "Save changes",
  "modify.ineligible": "This vignette can no longer be modified.",
  "modify.success": "Order successfully modified",
  /** mirrors api/controllers/public-me.js#MODIFY_ERROR_MESSAGES */
  "modify.reason.order_status":
    "Only pending, active, deferred or approved orders can be modified.",
  "modify.reason.already_modified":
    "Vignette data can only be changed once. This order has already been modified.",
  "modify.reason.no_flex":
    "This order doesn't have the flexible option, so its data can't be changed.",
  "modify.reason.window_passed": "The window for changing this vignette has closed.",

  "transfer.title": "Transfer vignette",
  "transfer.description":
    "You can transfer your vignette to another account only once. The recipient must already be registered with this email.",
  "transfer.recipientEmail": "Recipient email",
  "transfer.emailPlaceholder": "name@example.com",
  "transfer.action": "Transfer",
  "transfer.success": "Order successfully transferred",

  "refund.title": "Refund this vignette?",
  "refund.full": "You'll get a full refund.",
  "refund.fullAmount": "You'll get a full refund of {amount}.",
  "refund.partial": "A partial refund of {percent}% is available.",
  "refund.partialAmount": "A partial refund of {percent}% ({amount}) is available.",
  "refund.stopsNote": "The vignette stops being valid immediately.",
  "refund.action": "Refund",
  "refund.keep": "Keep vignette",
  "refund.success": "Refunded {amount} ({percent}%)",

  /* -------------------------------------------------------- vignettes tab */
  "catalog.loadErrorTitle": "Couldn't load the catalog",
  "catalog.loadErrorBody": "Failed to load catalog",
  "catalog.empty": "No vignettes available for this country yet.",
  "catalog.countryLabel": "Country",
  "product.priceFrom": "from",
  "product.select": "Select",
  "product.restrictions": "Restrictions",
  "product.noRestrictions": "No vehicle restrictions",
  "product.restriction.height": "Height",
  "product.restriction.weight": "Weight",
  "product.restriction.seats": "Seats",
  "product.restriction.width": "Width",
  "product.restriction.direction": "Direction",

  /* ---------------------------------------------------------- order sheet */
  "order.stepOrder": "Order",
  "order.stepConfirm": "Confirm",
  "order.title": "Order {product} — {country}",
  "order.plateCountry": "Plate country",
  "order.platePlaceholder": "Registration plate",
  "order.plateLabel": "Registration plate",
  "order.vinPlaceholder": "VIN code",
  "order.vinLabel": "VIN code",
  "order.vinPrompt": "Type vin-code (required)",
  "order.validFrom": "Valid period from",
  "order.today": "Today",
  "order.tomorrow": "Tomorrow",
  "order.quickStartLabel": "Quick start date",
  "order.periodLabel": "Validity period",
  "order.driverDetails": "Driver details",
  "order.driverName": "Full name",
  "order.passportNumber": "Passport number",
  "order.passportCountry": "Passport country",
  "order.officialVignette": "Official vignette",
  "order.serviceFee": "Vignette online identification + VAT",
  "order.flexTitle": "Flex service",
  "order.flexRecommended": "(Recommended)",
  "order.flexTierLabel": "Flex tier",
  "order.flexDefault": "Default",
  "order.flexExpanded": "Expanded",
  "order.flexBenefitRefund": "Refundable before activation",
  "order.flexBenefitPlate": "Car plate can be changed before activation",
  "order.flexBenefitDate": "Travel date can be changed before activation",
  "order.fromTomorrowOnly": "This vignette can only start from tomorrow.",
  "order.mdOnMd":
    "A Moldovan vignette is not required for a Moldovan vehicle plate — pick a different plate country.",
  "order.next": "Next",
  "order.checkingPlate": "Checking plate…",
  "order.confirmIntro":
    "Double check the car plate and the countries as you will not be able to change this after placing an order.",
  "order.important": "Important!",
  "order.editPlate": "Edit plate",
  "order.plateNote": "The e-vignette below is for this plate.",
  "order.addOthers": "Add other e-vignettes in one click",
  "order.termsPrefix": "By clicking on pay I agree with the",
  "order.termsLink": "terms and conditions",
  "order.termsMiddle": "and the",
  "order.privacyLink": "privacy policy",
  "order.responsibility":
    "You are fully responsible for all data errors. After payment the data cannot be changed and the refund is not provided according to government rules!",
  "order.duplicateNote": "You can still place this order if you're sure it's not a duplicate.",
  "order.buyAnyway": "Buy anyway",
  "order.total": "Total · {count} vignette",
  "order.pay": "Pay",
  "order.acceptTerms": "Please accept the terms and conditions",
  "order.createFailed": "Could not create the order",
  "order.creating": "Creating your order…",
  "order.chargedInEuro":
    "Charged in euro: {amount}. The {currency} amount is an estimate — your bank sets the final rate.",
  "order.chargedInEuroPromo":
    "Charged in euro: {amount} — promo {code} took off {discount}. The {currency} amount is an estimate — your bank sets the final rate.",
  "order.promoOff": "Promo {code}: −{discount} off {subtotal}",

  /* ----------------------------------------------------------- promo code */
  "promo.label": "Promo code",
  "promo.placeholder": "Promo code",
  "promo.apply": "Apply",
  "promo.remove": "Remove promo code",
  "promo.notApplicable": "This promo code doesn't apply to this order.",
  "promo.checkFailed": "Could not check this promo code",
  "promo.autoApplied": "{name} applied automatically — −{discount}",
  "promo.autoAppliedWithSummary": "{name} applied automatically — −{discount} ({summary})",
  "promo.cashbackNote": "{amount} cashback lands in your wallet bonuses after payment.",

  /* ------------------------------------------------------- vehicle lookup */
  "lookup.action": "Find my vehicle",
  "lookup.pending": "Looking up…",
  "lookup.noVin": "Found the vehicle, but the registry has no VIN for it.",
  "lookup.failed": "Could not look up this plate",
  "lookup.found": "Vehicle found.",
  "lookup.vin": "VIN {vin}",
  "plate.invalidGeneric": "This doesn't look like a valid plate.",
  "plate.invalidForCountry": "This doesn't look like a {country} plate.",
  "plate.rejected": "This plate cannot be used.",

  /* --------------------------------------------------------------- payment */
  "payment.closeLabel": "Close payment",
  "payment.openInBrowser": "Open payment page in browser",
  "payment.frameTitle": "Payment",
  "payment.waiting": "Waiting for the payment — you'll be redirected automatically",
  "payment.receivedTitle": "Payment received",
  "payment.receivedBody":
    "Payment has been successfully accepted and will be processed within the next 3–5 minutes.",
  "payment.fineWarning": "Driving without an active vignette will result in a FINE TICKET",
  "payment.goToVignettes": "Go to my vignettes",

  /* --------------------------------------------------------- support tab */
  "support.title": "Support",
  "support.intro": "Questions about an order, a refund or a fine? We're here to help.",
  "support.email": "Email us",
  "support.telegram": "Telegram",
  "support.telegramNote": "Fastest replies, 24/7",
  "support.helpCenter": "Help center",
  "support.footer":
    "When writing about an order, include the plate number and the order id — you'll find both on the Home tab.",

  /* ------------------------------------------------------- notifications */
  "notifications.title": "Notifications",
  "notifications.guestNote": "Alerts are kept on your account.",
  "notifications.guestNoteSuffix": "to receive payment and vignette updates here.",
  "notifications.emptyGuest":
    "Alerts are kept on an account — sign in to get payment and vignette updates here.",
  "notifications.empty": "Nothing here yet — payment and vignette updates will show up here.",
  "notifications.counts": "{unread} unread · {total} total",
  "notifications.countsAllRead": "{total} total",
  "notifications.markAllRead": "Mark all read",
  "notifications.markedRead": "Marked {count} as read",
  "notifications.alreadyRead": "Already all read",
  "notifications.markAsRead": "Mark as read",
  "notifications.markAsUnread": "Mark as unread",
  "notifications.readAt": "read {date}",

  /* ------------------------------------------------------------- account */
  "account.title": "Account",
  "account.guest": "Guest",
  "account.guestSubtitle": "Sign in to keep your vignettes across devices",
  "account.memberSince": "Member since {date}",
  "account.signedIn": "Signed in",
  "account.userId": "User ID: {id}",
  "account.signIn.title": "Sign in",
  "account.signIn.subtitle": "We'll email you a 6-digit code. No password needed.",
  "account.signIn.sendCode": "Send code",
  "account.signIn.codeSent": "Code sent — check your inbox",
  "account.signIn.enterCode": "Enter the code we sent to",
  "account.signIn.changeEmail": "Change email",
  "account.signIn.resend": "Resend code",
  "account.signIn.resendIn": "Resend in {seconds}s",
  "account.signIn.verifying": "Verifying…",
  "account.signIn.orContinue": "or continue with",
  "account.signIn.apple": "Continue with Apple",
  "account.signIn.appleNoToken": "Apple sign-in didn't return a token",
  "account.signIn.appleLoading": "Apple sign-in is still loading — try again in a moment",
  "account.signIn.signedIn": "Signed in",
  "account.signIn.linkApple":
    "Your Apple ID didn't share a usable email. Enter your real email — we'll verify it with a code and link it to your Apple sign-in.",
  "account.signIn.linkGoogle":
    "Your Google account didn't share a usable email. Enter your real email — we'll verify it with a code and link it to your Google sign-in.",
  "account.signOut": "Sign out",
  "account.signOutAll": "Sign out everywhere",
  "account.signedOut": "Signed out",
  "account.signedOutAll": "Signed out everywhere",

  "account.section.wallet": "Wallet",
  "account.section.referrals": "Invite friends",
  "account.section.vehicles": "My vehicles",
  "account.section.notifications": "Notifications",
  "account.section.push": "Push notifications",
  "account.section.sessions": "Devices & sessions",
  "account.section.consents": "Partner access",
  "account.section.currency": "Currency",
  "account.section.language": "Language",
  "account.section.plateRules": "Plate rules (dev)",
  "account.section.translations": "Translations (dev)",

  "account.wallet.balance": "Balance",
  "account.wallet.bonuses": "Bonuses",
  "account.referrals.copied": "Referral link copied",
  "account.referrals.invited": "Invited",
  "account.referrals.sales": "Sales",
  "account.referrals.income": "Income",
  "account.wallet.topUp": "Top up",
  "order.wallet.use": "Pay with wallet ({amount} available)",
  "order.wallet.note": "Taken off this order; you pay the rest.",
  "order.wallet.split": "{bonuses} bonuses go first, then {balance} balance.",
  /** bonuses buy vignettes but can never be cashed out — say it once */
  "account.wallet.bonusesNote":
    "Bonuses pay for vignettes but can't be withdrawn. Your balance can.",

  /* ------------------------------------------------------------ the wallet */
  "wallet.statement.title": "History",
  "wallet.statement.empty": "Money moving in and out of your wallet shows up here.",
  "wallet.topUp.chooseAmount": "How much?",
  "wallet.topUp.plusBonus": "+{bonus} bonus",
  "wallet.topUp.customAmount": "Other amount ({min}–{max})",
  "wallet.topUp.outOfRange": "Enter an amount between {min} and {max}.",
  "wallet.topUp.willGetBonus": "You'll also get {bonus} in bonuses.",
  "wallet.topUp.payAmount": "Top up {amount}",
  "wallet.topUp.currentBalance": "You have {amount} now",
  "wallet.topUp.paying": "Paying {amount}",
  "wallet.topUp.frameTitle": "Wallet top-up",
  "wallet.topUp.waiting": "Waiting for your payment…",
  "wallet.topUp.doneTitle": "Wallet topped up",
  "wallet.topUp.done": "{amount} is now in your wallet.",
  "wallet.topUp.doneWithBonus": "{amount} plus {bonus} bonus is now in your wallet.",
  /* one label per ledger type the API can return */
  "wallet.entry.top_up": "Top-up",
  "wallet.entry.order_payment": "Paid for a vignette",
  "wallet.entry.referral_reward": "Invite reward",
  "wallet.entry.cashback": "Cashback",
  "wallet.entry.cashback_reversal": "Cashback returned",
  "wallet.entry.withdrawal": "Withdrawal",
  "wallet.entry.refund": "Refund",
  "wallet.entry.bonus": "Bonus",
  "wallet.entry.welcome_bonus": "Welcome bonus",
  "wallet.entry.adjustment": "Adjustment",
  "wallet.entry.other": "Wallet activity",
  "wallet.entry.pending": "pending",
  "wallet.entry.cancelled": "cancelled",

  /* ---------------------------------------------------------- invitations */
  "account.referrals.explainer":
    "Share your link. You get {reward} into your balance every time someone you invited buys a vignette.",
  "account.referrals.share": "Share",
  "account.referrals.shareTitle": "Vignette ID",
  "account.referrals.shareText": "Buy your vignette here — I get {reward} when you do.",
  "account.referrals.invitedBy": "Invited by {name}",
  "account.referrals.tab.invited": "People",
  "account.referrals.tab.earnings": "Rewards",
  "account.referrals.noInvites": "Nobody has used your link yet.",
  "account.referrals.noEarnings": "Rewards land here when someone you invited buys.",
  "account.referrals.purchases": { one: "{count} purchase", other: "{count} purchases" },
  "account.referrals.noPurchasesYet": "no purchases yet",
  "account.referrals.level": "level {level}",
  "account.referrals.codeInvalid": "That invite code isn't valid any more.",
  "account.vehicles.emptyGuest": "Plates from the vignettes you buy here will appear here.",
  "account.vehicles.empty": "Vehicles from your orders will appear here.",
  "account.vehicles.vin": "VIN: {vin}",

  "account.push.unsupported": "This browser doesn't support push notifications.",
  "account.push.intro": "Get order status alerts on this device, even with the tab closed.",
  "account.push.turnOn": "Turn on notifications",
  "account.push.turnOff": "Turn off notifications",
  "account.push.blocked":
    "Blocked for this site — re-enable it in the browser's site settings to retry.",
  "account.push.notConfigured": "Push notifications aren't set up on the server yet",
  "account.push.denied":
    "Permission denied — reset it in the browser's site settings to retry",
  "account.push.dismissed": "Permission dismissed — nothing registered",
  "account.push.registeredBound": "Registered — bound to {email}",
  "account.push.registered":
    "Registered — orders placed from this browser will alert here",
  "account.push.turnedOff": "Notifications turned off on this device",

  "account.sessions.unknownDevice": "Unknown device",
  "account.sessions.thisDevice": "This device",
  "account.sessions.meta": "{ip} · created {created}",
  "account.sessions.metaLastUsed": "{ip} · created {created} · last used {lastUsed}",

  "account.consents.empty": "No partner apps have access to your full order history.",
  "account.consents.row": "Partner #{id} · {scope} · granted {date}",
  "account.consents.grant": "Grant",
  "account.consents.revoke": "Revoke",
  "account.consents.granted": "Full account access granted to this app's partner",
  "account.consents.revoked": "Access revoked",
  "account.consents.note":
    "Granting lets this app's partner read your whole order history (orders?scope=all). Revocation is immediate.",

  "account.currency.label": "Display currency",
  "account.currency.note":
    "Prices are shown in this currency. Payments are always taken in euro; other currencies are estimates.",
  "account.language.label": "App language",
  "account.language.note":
    "Changes the app and the messages the server writes for you (plate hints, for example). Payment pages and receipts follow your account's own language.",
  "account.language.systemDefault": "Match my device",

  "account.rate.title": "Rate the app",
  "account.rate.subtitle": "Tell us how we're doing",
  "account.rate.subtitleRated": "Thanks for rating — change your mind any time",

  /* ---------------------------------------------------------- rate sheet */
  "rate.title": "How do you like vignette.id?",
  "rate.subtitle": "Tap the stars. A word or two on what to improve is welcome.",
  "rate.label": "Rating",
  "rate.starLabel": { one: "{count} star", other: "{count} stars" },
  "rate.star1": "Terrible",
  "rate.star2": "Poor",
  "rate.star3": "Okay",
  "rate.star4": "Good",
  "rate.star5": "Excellent",
  "rate.commentPlaceholder": "What could be better? (optional)",
  "rate.send": "Send rating",
  "rate.failed": "Couldn't send your rating",
  "rate.thanksTitle": "Thank you!",
  "rate.thanksStore":
    "Glad you like it. A public review helps other drivers find us — it takes a minute.",
  "rate.thanksBody": "Your feedback goes straight to the team that builds the app.",
  "rate.writeReview": "Write a review",
  "rate.maybeLater": "Maybe later",

  /* ------------------------------------------------------ dev-only panels */
  "dev.plateRules.version": "Rules version",
  "dev.plateRules.language": "Copy language",
  "dev.plateRules.languageValue": "{language} of {count} served",
  "dev.plateRules.countries": "Countries with rules",
  "dev.plateRules.countriesValue": "{withRules} of {accepted} accepted",
  "dev.plateRules.selfCheck": "Self-check",
  "dev.plateRules.selfCheckValue": "{passed}/{total} agree",
  "dev.translations.language": "Active language",
  "dev.translations.coverage": "Coverage",
  "dev.translations.coverageValue": "{translated}/{total} strings",
  "dev.translations.missing": "Missing keys",
  "dev.translations.unknown": "Unknown keys",
  "dev.translations.complete": "Complete — every key is translated.",
} as const
