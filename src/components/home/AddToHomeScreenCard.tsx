import type React from 'react';
import styles from './AddToHomeScreenCard.module.css';

interface AddToHomeScreenCardProps {
  onOpen: () => void;
  onDismiss: () => void;
}

/**
 * The slim Today nudge toward the home-screen icon. Whether it shows is
 * `useHomeScreenInstall`'s call; this only draws it. A div, not a button, because the ✕
 * is its own target and buttons can't nest.
 */
export function AddToHomeScreenCard({ onOpen, onDismiss }: AddToHomeScreenCardProps): React.ReactElement {
  return (
    <div className={styles.card}>
      <button type="button" className={styles.open} onClick={onOpen}>
        <img src="/wodi-icon-180.png" alt="" className={styles.appIcon} />
        <span className={styles.copy}>
          <span className={styles.title}>wodi&rsquo;s better on your home screen</span>
          <span className={styles.cta}>Show me &rarr;</span>
        </span>
      </button>
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Hide"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
