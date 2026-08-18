/**
 * Feed domain types.
 *
 * The feed is global, no-follow and ephemeral: every post is younger than
 * FEED_WINDOW_MS and disappears on its own. There is no archive and no
 * follow graph, so a post carries everything needed to render it — see
 * PosterPayload. Nothing here points back at /workouts.
 */

import type { PosterPayload } from '../../components/celebration/faces/HandwrittenFace/posterPayload';

/** 24 hours. A post older than this is never shown and is eligible for deletion. */
export const FEED_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * How the author appears in the feed — a copy of their community profile, not a
 * pointer to it. Frozen alongside the poster, so renaming yourself tomorrow
 * doesn't rewrite what you posted today.
 */
export interface FeedAuthor {
  /** Self-chosen display name. The only identity the feed shows. */
  name: string;
  /** Box / gym, free text. */
  gym?: string;
  /** "City, Country", free text. */
  location?: string;
  /** Instagram username, bare — see utils/instagram. */
  instagram?: string;
  /**
   * Tokenized Storage download URL for the athlete's avatar, frozen like the
   * rest of this block. Optional on purpose: posts published before avatars
   * crossed into the feed have none, and those fall back to initials forever.
   */
  photoUrl?: string;
}

/**
 * A reactor: their identity plus the uid that keyed the flame doc.
 *
 * The uid is the list key and the optimistic-update key. Names are not unique
 * and are not identity, so nothing may key off them.
 */
export interface FeedReactor extends FeedAuthor {
  id: string;
}

export interface FeedPost {
  id: string;
  userId: string;
  author: FeedAuthor;
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

/** Reaction state for one post, derived from the flames subcollection. */
export interface FeedReactions {
  count: number;
  /** The athletes who reacted, most recent first. */
  by: FeedReactor[];
  /** Whether the signed-in athlete has reacted. */
  mine: boolean;
}
