/**
 * Who gets the triage-only affordances (load-from-recent, the test-workout flag).
 *
 * THE one definition — the address used to be re-typed per screen, so a second gate could quietly
 * disagree with the first about who counts as admin.
 */
const ADMIN_EMAIL = 'aborovitz@gmail.com';

export function isAdminEmail(email: string | null | undefined): boolean {
  return email?.toLowerCase() === ADMIN_EMAIL;
}
