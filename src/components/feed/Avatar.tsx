import { avatarUrl } from '../../services/feed/types';
import type { PublicProfile } from '../../services/feed/types';
import { UNKNOWN_ATHLETE } from './feedFormat';
import styles from './Avatar.module.css';

interface AvatarProps {
  /** Undefined renders the initials tile — the same state as an athlete with no photo. */
  profile: PublicProfile | undefined;
  size?: number;
}

/**
 * The athlete's avatar — their photo when their profile carries one, and a
 * name-derived initials tile when it doesn't.
 *
 * The initials tile is not a placeholder to be designed around: an athlete with
 * no photo keeps it forever, so both forms are permanent and have to look
 * equally deliberate. The colour is hashed from the name, which makes it stable
 * per athlete across sessions.
 */
export function Avatar({ profile, size = 34 }: AvatarProps): React.ReactElement {
  const src = avatarUrl(profile);
  if (src) {
    return (
      <img
        className={styles.photo}
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }

  const name = profile?.name ?? UNKNOWN_ATHLETE;

  // First letter of the first two words — "Amir Borovitz" reads as AB, where
  // slicing the raw string would give AM.
  const letters = name
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/gi, '').charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;

  return (
    <span
      className={styles.avatar}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(140deg, hsl(${hash} 42% 26%), hsl(${(hash + 40) % 360} 38% 17%))`,
      }}
      aria-hidden="true"
    >
      {letters}
    </span>
  );
}
