/**
 * Instagram username normalization.
 *
 * Athletes type this field every way there is — "@name", "instagram.com/name",
 * a full share URL with tracking params. All of those mean the same account, so
 * the field is normalized once on entry and stored bare: lowercase, no "@", no
 * host. Everything downstream (the feed link, the profile row) can then assume
 * the stored value is already a username.
 */

/** Instagram's own cap. Longer input is truncated rather than rejected. */
export const INSTAGRAM_MAX_LENGTH = 30;

/** Strips any "@", URL or query string, lowercases, and drops invalid characters. */
export function normalizeInstagram(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.)?instagram\.com\//i, '')
    .replace(/[?/].*$/, '')
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, INSTAGRAM_MAX_LENGTH);
}

/** Profile URL for an already-normalized username. */
export function instagramUrl(username: string): string {
  return `https://instagram.com/${username}`;
}
