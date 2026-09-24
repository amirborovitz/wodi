/**
 * Feed domain types.
 *
 * The feed is global, no-follow and ephemeral: every post is younger than
 * FEED_WINDOW_MS and disappears on its own. There is no archive and no follow
 * graph. Identity is a live lookup through /publicProfiles, so an athlete looks
 * the same everywhere at once. Nothing here points back at /workouts.
 *
 * A POST IS NOT A WORKOUT
 * A workout is history — it lives in /workouts forever and the athlete owns it.
 * A post is a thing they said to the room for a day. EVERY POST HAS A PHOTO:
 * the feed is a room full of people, and a wall of posters with no faces in it
 * is a leaderboard. The workout is an optional attachment on top of the photo
 * and the caption is an extra on top of that. The full poster still lives in
 * the Gallery, where it is the artifact; here it rides the photo as a ticket.
 *
 * Everything a post carries is frozen at publish time: editing the workout
 * afterwards never rewrites the post.
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

/**
 * Longest caption a post can carry. One line under the card, not a post body:
 * the poster is the artifact and the caption is the aside beside it.
 */
export const CAPTION_MAX = 120;

/** Stored absent rather than as "", so an untouched prompt publishes nothing. */
export function normalizeCaption(text: string | undefined): string | undefined {
  const trimmedText = text?.trim().slice(0, CAPTION_MAX);
  return trimmedText ? trimmedText : undefined;
}

/**
 * When the session on this post was TRAINED — never when the post was written.
 *
 * The two are routinely hours apart: train at 7am, post at 6pm. The card's age
 * ("2 hours ago") is about the post, so without this the feed would quietly
 * claim an evening session. Frozen at publish time alongside the poster.
 *
 * `hasTime` is not a formatting flag — it says which of two different facts we
 * actually hold. A workout logged the day it was trained carries the session's
 * own clock in `at`. A board dated to an earlier day (the athlete tapped the
 * poster's date, or the parser read it off the whiteboard) gives us the
 * calendar day and nothing more, and `at` is that day's local midnight. Printing
 * "12:00am" there would invent an hour nobody entered.
 */
export interface FeedTrained {
  at: Date;
  hasTime: boolean;
}

/**
 * The photo behind ONE post — deliberately NOT `workout.posterPhoto`.
 *
 * That field is a polaroid the athlete sticks on their poster: permanent, part
 * of the artifact, visible on the Home thumbnail and in the share capture. This
 * is the shot behind a 24-hour post, chosen at publish time and gone when the
 * post is. Posting the same workout twice means two of these and still one
 * poster. Collapsing them into one field is what made adding a photo to a post
 * silently edit the athlete's poster.
 */
export interface FeedPhoto {
  /** Tokenized Storage download URL. */
  url: string;
  /** Storage object path, kept so deleting the post can delete the file. */
  path: string;
}

export interface FeedPost {
  id: string;
  /** The author, resolved through /publicProfiles at render time. */
  userId: string;
  /**
   * The workout this post is about, frozen at publish time. Optional — a shot
   * of the whiteboard or the 6am crew is a perfectly good thing to put in the
   * room, and demanding a poster for it is what kept those off the feed
   * entirely.
   */
  poster?: PosterPayload;
  /** Present exactly when `poster` is: it is the poster's session, not the post's. */
  trained?: FeedTrained;
  /**
   * Required on anything published from here on — see the note above. Still
   * optional on the way IN, because posts written before the photo became
   * mandatory are still inside the 24h window; they render as the bare poster,
   * which is exactly what they always looked like. A day from now that branch
   * stops being reachable on its own.
   */
  photo?: FeedPhoto;
  /**
   * The athlete's own line about the session.
   *
   * Optional and deliberately unprompted-for as a result: the composer asks
   * "Say something…", never "how did it go", so "not my day, still went" is as
   * postable as a PR. It is never the whole post — a caption with nothing
   * attached cannot be published. Immutable like the rest of the post.
   */
  caption?: string;
  createdAt: Date;
  expiresAt: Date;
  isPR: boolean;
}

/**
 * What the client hands to createFeedPost; ids and timestamps are set there.
 *
 * The photo is required HERE and optional on FeedPost: this is what may be
 * written, that is what may be read back. The asymmetry is the migration, and
 * it expires with the 24h window rather than needing a backfill.
 */
export interface FeedPostInput {
  photo: FeedPhoto;
  poster?: PosterPayload;
  trained?: FeedTrained;
  caption?: string;
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
