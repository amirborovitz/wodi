import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The build this running bundle was compiled from. vite.config.ts writes the same
 * pair into /version.json at build time, so comparing the two answers one question:
 * is the code executing right now the code that is currently deployed?
 */
const RUNNING_BUILD = `${__APP_VERSION__}·${__BUILD_TIME__}`;

/**
 * Resuming an installed app can fire `visibilitychange` several times in a row (the
 * app switcher alone does it), and the check costs a network round trip, so a
 * successful look-up parks further checks for a minute.
 */
const MIN_CHECK_INTERVAL_MS = 60_000;

interface VersionManifest {
  version: string;
  buildTime: string;
}

export interface UseAppVersionResult {
  /** A build newer than the one running in this tab is live on the server. */
  updateReady: boolean;
  /** Reload onto the deployed build. */
  applyUpdate: () => void;
}

function isVersionManifest(value: unknown): value is VersionManifest {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.version === 'string' && typeof candidate.buildTime === 'string';
}

/**
 * Notices when the deployed build has moved on from the one this app is running.
 *
 * An installed iOS PWA is the case this exists for. `display: standalone` strips
 * Safari's chrome, and pull-to-refresh goes with it, so a home-screen launch has no
 * user-reachable way to reload — the app can sit on a stale build indefinitely,
 * because iOS keeps the web view alive across launches and a warm resume never
 * re-requests index.html at all. The app therefore has to ask on its own behalf.
 *
 * Checks run on mount and every time the app comes back to the foreground, which is
 * exactly the moment a home-screen launch lands on.
 */
export function useAppVersion(): UseAppVersionResult {
  const [updateReady, setUpdateReady] = useState(false);
  const lastCheckRef = useRef(0);

  const applyUpdate = useCallback((): void => {
    window.location.reload();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const check = async (): Promise<void> => {
      // Once stale, always stale — a second look-up can't un-deploy the new build,
      // and dropping the prompt out from under a thumb heading for it is worse than
      // one wasted request.
      if (updateReady) return;

      const now = Date.now();
      if (now - lastCheckRef.current < MIN_CHECK_INTERVAL_MS) return;
      lastCheckRef.current = now;

      try {
        // `no-store` on the request as well as `no-cache` on the response: the header
        // governs the CDN and the browser cache, this governs the app's own fetch,
        // and the whole point of this file is that it must never be read from a copy.
        const response = await fetch('/version.json', { cache: 'no-store' });
        if (!response.ok) return;

        const payload: unknown = await response.json();
        if (cancelled || !isVersionManifest(payload)) return;

        const deployedBuild = `${payload.version}·${payload.buildTime}`;
        if (deployedBuild !== RUNNING_BUILD) setUpdateReady(true);
      } catch {
        // Offline, or a dev server with no /version.json to serve. Staying on the
        // current build is the correct outcome either way.
      }
    };

    const handleVisibility = (): void => {
      if (document.visibilityState === 'visible') void check();
    };

    void check();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [updateReady]);

  return { updateReady, applyUpdate };
}
