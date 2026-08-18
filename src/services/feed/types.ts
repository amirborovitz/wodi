/**
 * Feed domain types.
 *
 * The feed is global, no-follow and ephemeral: every post is younger than
 * FEED_WINDOW_MS and disappears on its own. There is no archive and no follow
 * graph. A post carries the POSTER it renders — frozen, because that is a
 * record of what the athlete did — and nothing else: identity is a live lookup
 * through /publicProfiles, so an athlete looks the same everywhere at once.
 * Nothing here points back at /workouts.
 */

import type { PosterPayload } from '../../components/celebration/faces/HandwrittenFace/posterPayload';
import type { User } from '../../types';


/**
 * One athlete's public identity — the /publicProfiles/{uid} doc.
 *
 * Everything the feed is allowed to know about a person, and nothing else: no
 * stats, no history, no body metrics. They cannot reach a card even by
 * accident, because this is the only shape the feed components accept and it
 * has no field for them.
 *
 * WHY IT IS ITS OWN DOCUMENT
 * Firestore rules are per-DOCUMENT, not per-field: "allow read" on /users
 * grants the whole doc, and there is no way to expose displayName while
 * withholding email, sex, bodyweight and stats. (Field-level restrictions exist
 * for writes — diff().affectedKeys() — but there is no read equivalent.) The
 * document boundary IS the permission boundary, so publishing an identity means
 * putting it in its own document.
 */
export interface PublicProfile {
  /** The athlete's uid. It IS the doc id, so it is never stored inside the doc. */
  id: string;
  /** Self-chosen display name. The only identity the feed shows. */
  name: string;
  /** Box / gym, free text. */
  gym?: string;
  /** "City, Country", free text. */
  location?: string;
  /** Instagram username, bare — see utils/instagram. */
  instagram?: string;
  /** Tokenized Storage download URL. Renders for anyone holding it. */
  photoUrl?: string;
  /** Cache-buster for the URL above; a re-upload keeps the same path. */
  photoUpdatedAt?: number;
}

/** Optional free text is stored absent, never as "", so clearing a field unpublishes it. */
function trimmed(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

/**
 * THE chokepoint where a User becomes public. Every field that crosses is named
 * here; anything not named cannot leave the user doc. Adding a field to User
 * therefore publishes nothing until someone edits this function on purpose.
 */
export function toPublicProfile(user: User): PublicProfile {
  return {
    id: user.id,
    name: user.displayName,
    gym: trimmed(user.gym),
    location: trimmed(user.location),
    instagram: trimmed(user.instagram),
    photoUrl: user.photoUrl,
    photoUpdatedAt: user.photoUpdatedAt,
  };
}

/**
 * The avatar URL with its cache-buster applied.
 *
 * A re-uploaded photo reuses the same URL, so the stamp is what makes a changed
 * photo actually appear. Built at render time from two stored fields rather than
 * baked into the stored string — the frozen author block this replaced had to
 * bake it in, having no live doc to read it from.
 */
export function avatarUrl(profile: PublicProfile | undefined): string | undefined {
  if (!profile?.photoUrl) return undefined;
  return `${profile.photoUrl}?v=${profile.photoUpdatedAt ?? 0}`;
}

/** 24 hours. A post older than this is never shown and is eligible for deletion. */
export const FEED_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface FeedPost {
  id: string;
  /** The author, resolved through /publicProfiles at render time. */
  userId: string;
  /** Frozen at publish time — editing the workout later never changes this. */
  poster: PosterPayload;
  createdAt: Date;
  expiresAt: Date;
  isPR: boolean;
}

/** What the client hands to createFeedPost; ids and timestamps are set there. */
export interface FeedPostInput {
  poster: PosterPayload;
  isPR: boolean;
}

/**
 * Reaction state for one post, derived from the flames subcollection.
 *
 * `by` is uids, not identities: a flame doc is keyed by its reactor's uid and
 * holds nothing else, so the list of reactors is literally the list of doc ids.
 */
export interface FeedReactions {
  count: number;
  /** The uids that reacted. Resolve through useProfiles to render them. */
  by: string[];
  /** Whether the signed-in athlete has reacted. */
  mine: boolean;
}
