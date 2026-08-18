import type { User } from '../../types';
import type { FeedAuthor } from './types';

/**
 * The public identity block copied into every post and every flame.
 *
 * The single place a User becomes a FeedAuthor: publishing and reacting must
 * agree on what "me" looks like, and nothing outside the community profile
 * (email, stats, and every body metric — age, weight, sex) is ever allowed to
 * cross into the feed. The avatar is the one deliberate exception: it is part
 * of how an athlete presents themselves, and its URL is already a tokenized
 * Storage link that renders for anyone holding it, so sharing it needs no
 * loosening of the owner-only rule on /users.
 *
 * The `?v=` stamp is baked in rather than appended at render time, because a
 * frozen author block has no live user doc to read `photoUpdatedAt` from.
 */
export function toFeedAuthor(user: User): FeedAuthor {
  return {
    name: user.displayName,
    ...(user.gym ? { gym: user.gym } : {}),
    ...(user.location ? { location: user.location } : {}),
    ...(user.instagram ? { instagram: user.instagram } : {}),
    ...(user.photoUrl ? { photoUrl: `${user.photoUrl}?v=${user.photoUpdatedAt ?? 0}` } : {}),
  };
}
