/**
 * App-wide constants shared across domains.
 * Keep this file small and purely value-typed — no runtime logic, no DB, no framework imports.
 */

/** IANA timezone for all "local time" calculations in the app. Solo-admin / single-household assumption. */
export const APP_TIMEZONE = 'Australia/Sydney'

/** Default locale for date/currency formatting. */
export const APP_LOCALE = 'en-AU'

/** Australian FY runs Jul–Jun. Returns the calendar year the FY STARTS in, for a given date. */
export function fyStartYearFor(dateInAppTz: Date): number {
  // Caller is responsible for passing a date already interpreted in APP_TIMEZONE.
  return dateInAppTz.getMonth() >= 6 ? dateInAppTz.getFullYear() : dateInAppTz.getFullYear() - 1
}

/** Returns the current wall-clock time in APP_TIMEZONE as a Date whose local fields (getFullYear/getMonth/getDate/etc.) reflect Sydney, not UTC or the server's TZ. Intended for range-math only — the returned Date loses its original TZ. */
export function nowInAppTz(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: APP_TIMEZONE }))
}
