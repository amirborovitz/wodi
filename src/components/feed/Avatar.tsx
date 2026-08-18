import styles from './Avatar.module.css';

interface AvatarProps {
  name: string;
  size?: number;
  /** Frozen on the author block at publish time; initials stand in without it. */
  photoUrl?: string;
}

/**
 * The athlete's avatar — their photo when the author block carries one, and a
 * name-derived initials tile when it doesn't.
 *
 * The initials tile is not a placeholder to be designed around: most posts
 * predate avatars in the feed, and an athlete with no photo keeps it forever,
 * so both forms are permanent and have to look equally deliberate. The colour
 * is hashed from the name, which makes it stable per athlete across sessions.
 */
export function Avatar({ name, size = 34, photoUrl }: AvatarProps): React.ReactElement {
  if (photoUrl) {
    return (
      <img
        className={styles.photo}
        src={photoUrl}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }

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
