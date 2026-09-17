/**
 * Where the Share button lives in the Safari the athlete is holding.
 *
 * - `toolbar` — the classic bottom bar, Share in plain sight (Safari ≤ 18).
 * - `menu` — Safari 26's compact layout folds Share into the "•••" button.
 */
export type SafariShareLocation = 'toolbar' | 'menu';

const OTHER_IOS_BROWSERS = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//;

/**
 * Null when this isn't iPhone/iPad Safari, so there is nothing to explain: Chrome, Firefox
 * and Edge on iOS put Share elsewhere, and in-app browsers (Instagram, Gmail) can't add to
 * the home screen at all.
 */
export function safariShareLocation(userAgent: string, maxTouchPoints = 0): SafariShareLocation | null {
  // iPadOS asks for the desktop site, so its UA says "Macintosh"; touch is what gives it away.
  const isIOS = /iPhone|iPad|iPod/.test(userAgent)
    || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (!isIOS) return null;
  // Only real Safari carries both tokens — a WKWebView inside another app carries neither.
  if (!/Version\/\d+/.test(userAgent) || !/Safari\//.test(userAgent)) return null;
  if (OTHER_IOS_BROWSERS.test(userAgent)) return null;
  // Safari's own version, not the OS token: iOS 26 froze "OS 18_6" in the UA but kept
  // reporting "Version/26" for Safari.
  const major = Number(userAgent.match(/Version\/(\d+)/)?.[1] ?? 0);
  return major >= 26 ? 'menu' : 'toolbar';
}

/** Running from the home-screen icon rather than inside a browser tab. */
export function isHomeScreenApp(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}
