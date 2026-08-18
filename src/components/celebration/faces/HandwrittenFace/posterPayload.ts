/**
 * The read-only render contract for a poster.
 *
 * HandwrittenFace is an EDITOR — skin chips, vibe picker, date override, sticker
 * input, correction sheet, delete menu. It must never render someone else's
 * poster. Everything that only *displays* a poster (PosterThumbnail on
 * Home/Gallery, the feed card) renders this payload instead: the same skin
 * components, none of the controls.
 *
 * It is also exactly what a feed post freezes at publish time, which is why it
 * carries no workout id and no reference back to /workouts — a feed post is a
 * snapshot, not a pointer.
 */

import type { PosterPhoto, PosterSkinId, PosterSticker, PosterVibeKey, PosterVibeOffset } from '../../../../types';
import type { PosterWod } from './posterData';

export interface PosterPayload {
  /**
   * Every page of the workout, in reading order — never empty. A multi-part
   * session is several posters (metcon, strength, skill…), and a snapshot that
   * froze only one of them publishes a fraction of the day's work.
   *
   * Index 0 is the lead page: the card the deck opens on, the one that carries
   * the sticker and photo, and the ONLY one a single-poster surface (the Home
   * and Gallery thumbnails) renders. A feed post puts the card the athlete
   * posted from there — swiping to a part before tapping Post is a choice about
   * what leads. Everywhere else it's buildPosterWodPages' order, which starts
   * with the metcon: the part that reads as "the workout" to a passing scroller.
   */
  wods: PosterWod[];
  skin: PosterSkinId | undefined;
  vibe: PosterVibeKey | null;
  vibeOffset?: PosterVibeOffset;
  sticker?: PosterSticker;
  photo?: PosterPhoto;
}
