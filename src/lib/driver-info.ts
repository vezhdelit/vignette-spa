/**
 * The driver-info shape check, mirrored from the API's
 * `api/frontend/driver-info.js` so the form refuses the same input the
 * server does (`invalid_user_data` on `user.user_name` /
 * `user.passport_number`).
 *
 * Driver info is only asked for when the period carries
 * `driver_info_required` — today Moldova. The worker types it into the
 * Moldovan registry, which reads the passport's machine-readable zone:
 * Latin letters only. The name is any Latin-script letters (diacritics
 * included — "Ștefan Țurcanu" is how a Moldovan passport prints it), at
 * least two words, because the registry gets the first word as the given
 * name and the second as the surname; the passport number is ASCII letters
 * and digits as printed in the MRZ.
 *
 * Shape checks, not proof: the values are typed off a document by hand.
 */

const LATIN_WORD = "\\p{Script=Latin}[\\p{Script=Latin}'’.\\-]*"
const LATIN_NAME_PATTERN = new RegExp(`^${LATIN_WORD}(?: +${LATIN_WORD})+$`, "u")
const MAX_NAME_LENGTH = 100
const PASSPORT_PATTERN = /^[A-Za-z0-9]{4,20}$/

export function isLatinName(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length <= MAX_NAME_LENGTH && LATIN_NAME_PATTERN.test(trimmed)
}

export function isLatinPassportNumber(value: string): boolean {
  return PASSPORT_PATTERN.test(value.trim())
}

export type DriverInfoProblem = "latin_name" | "latin_passport"

/**
 * The first typed field that fails, or null. Empty fields pass — whether a
 * field is required is the form's rule; this only says whether what was
 * typed is well-formed.
 */
export function findInvalidDriverInfo({
  fullName,
  passportNumber,
}: {
  fullName: string
  passportNumber: string
}): DriverInfoProblem | null {
  if (fullName.trim() && !isLatinName(fullName)) return "latin_name"
  if (passportNumber.trim() && !isLatinPassportNumber(passportNumber)) return "latin_passport"
  return null
}
