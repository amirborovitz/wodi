import { useEffect, useMemo, useState } from 'react';
import {
  cachedProfile, requestProfiles, subscribeProfiles,
} from '../services/feed/publicProfile';
import type { PublicProfile } from '../services/feed/types';

function collect(ids: string[]): Map<string, PublicProfile> {
  const resolved = new Map<string, PublicProfile>();
  for (const id of ids) {
    const profile = cachedProfile(id);
    if (profile) resolved.set(id, profile);
  }
  return resolved;
}

/**
 * Resolves uids to public identities.
 *
 * The rule everywhere in the feed is "you resolve what you render": a card asks
 * for its author and its avatar stack, a sheet asks for its list. That reads as
 * many small lookups, but the cache underneath collects every uid asked for in a
 * tick and fetches them in one batched query — so a 60-post feed by 30 athletes
 * costs one query, not sixty, and every surface showing the same person shows
 * the same object.
 */
export function useProfiles(ids: readonly string[]): Map<string, PublicProfile> {
  // Joined so the effect keys off the ids themselves rather than array identity,
  // which a caller building a fresh array each render would break.
  const key = ids.filter(Boolean).join(',');
  const [resolved, setResolved] = useState<Map<string, PublicProfile>>(() => collect(key ? key.split(',') : []));

  useEffect(() => {
    const wanted = key ? key.split(',') : [];
    // Runs on every store change and on every id change, which are the only two
    // ways the answer can move. Reading through the cache rather than holding a
    // copy is what keeps two components asking for the same athlete in step.
    const sync = (): void => setResolved(collect(wanted));
    sync();
    requestProfiles(wanted);
    return subscribeProfiles(sync);
  }, [key]);

  return resolved;
}

/** One athlete. `undefined` covers both "still loading" and "no profile doc". */
export function useProfile(id: string | undefined): PublicProfile | undefined {
  const ids = useMemo(() => (id ? [id] : []), [id]);
  return useProfiles(ids).get(id ?? '');
}
