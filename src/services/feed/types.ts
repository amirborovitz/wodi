/**
 * Feed domain types.
 *
 * The feed is global, no-follow and ephemeral: every post is younger than
 * FEED_WINDOW_MS and disappears on its own. There is no archive and no follow
 * graph. A post carries the POSTER it renders and the athlete's own line about
 * it — both frozen, because they are a record of what the athlete did and said
 * — and nothing else: identity is a live lookup through /publicProfiles, so an
 * athlete looks the same everywhere at once. Nothing here points back at
 * /workouts.
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
  /** How the photo is framed. Absent means dead centre at cover scale. */
  crop?: PhotoCrop;
  /** Where the poster was dragged to. Absent means its resting place. */
  posterOffset?: PosterOffset;
}

/**
 * The poster's displacement from where the frame parks it, in % of frame width
 * and height. Both the photo AND the poster move: dragging the photo decides
 * what shows, dragging the poster decides what it covers, and there is no
 * single one of those that solves both.
 */
export interface PosterOffset {
  x: number;
  y: number;
}

export const NO_POSTER_OFFSET: PosterOffset = { x: 0, y: 0 };

/**
 * How a photo sits inside the 9:16 story frame.
 *
 * The frame crops — a phone photo is 3:4 or 4:3 and the frame is 9:16, so
 * something is always cut off and WHICH something is the athlete's call. This
 * is the control that makes it theirs: drag to choose what shows, pinch to
 * decide how close.
 *
 * The poster, by contrast, does not move. It is a document rather than a
 * sticker, so there is no placement that improves it — and with the photo
 * movable there is nothing left for a poster nudge to solve: you frame the
 * subject into the bands rather than sliding the poster off the subject.
 * One draggable thing per frame, so a drag is never ambiguous.
 */
export interface PhotoCrop {
  /** 1 = exactly covers the frame. Panning is bounded by whatever overhangs. */
  scale: number;
  /** Pan from centred, in % of frame width / height. */
  x: number;
  y: number;
}

export const DEFAULT_CROP: PhotoCrop = { scale: 1, x: 0, y: 0 };

/** Past this the 1080px upload starts to show its pixels. */
export const MAX_PHOTO_SCALE = 3;

export interface FeedPost {
  id: string;
  /** The author, resolved through /publicProfiles at render time. */
  userId: string;
  /** Frozen at publish time — editing the workout later never changes this. */
  poster: PosterPayload;
  /**
   * Optional. Absent means the card is the poster alone, which is the majority
   * of posts and reads fine: the poster is the artifact, the photo is context.
   */
  photo?: FeedPhoto;
  /**
   * The athlete's own line about the session, frozen with the poster.
   *
   * Optional and deliberately unprompted-for as a result: the sheet asks "What
   * happened in there?", never "how did it go", so "not my day, still went" is
   * as postable as a PR. Immutable like the rest of the post — there is no
   * edit, only delete.
   */
  caption?: string;
  createdAt: Date;
  expiresAt: Date;
  isPR: boolean;
}

/** What the client hands to createFeedPost; ids and timestamps are set there. */
export interface FeedPostInput {
  poster: PosterPayload;
  photo?: FeedPhoto;
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
