// Mirrors the format the backend accepts (vignette.id
// api/frontend/vin-codes.js): 9 to 17 alphanumerics. Not every vehicle
// carries a 17-character ISO 3779 VIN — a Japanese chassis number such as
// ANH208038128 is 12 — and this used to accept only 9 or 17 exactly, which
// refused those at checkout.
const VIN_PATTERN = /^[a-z0-9]{9,17}$/i

export function isValidVin(vin: string): boolean {
  return VIN_PATTERN.test(vin.trim())
}
