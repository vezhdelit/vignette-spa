// Mirrors the format the backend accepts (helpers/vehicle.js): a VIN is
// either the short 9-char form or the full 17-char ISO 3779 code.
const VIN_PATTERN = /^[a-z0-9]{9}$|^[a-z0-9]{17}$/i

export function isValidVin(vin: string): boolean {
  return VIN_PATTERN.test(vin.trim())
}
