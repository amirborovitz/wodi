import type React from 'react';
import type { ChaseFact } from '../../services/chase/chaseFacts';
import styles from './ChaseLine.module.css';

interface ChaseLineProps {
  fact: ChaseFact;
  /** Threads behind this one, for the "+N MORE" count. Zero hides it. */
  more: number;
  onOpen: () => void;
}

/**
 * Today's one line of Chase: a tag, the number, and what it's about.
 *
 * It sits in the slot the milestone line has always held, because a milestone and a chase are
 * the same shape — an observation the app computed from the log — one pointed backwards and
 * one pointed forwards. A milestone the athlete has just crossed is an event and still wins
 * the slot for the day; see HomeScreen.
 */
export function ChaseLine({ fact, more, onOpen }: ChaseLineProps): React.ReactElement {
  return (
    <button type="button" className={styles.line} onClick={onOpen} aria-label={`Open Chase — ${fact.raw}`}>
      <span className={styles.tag}>CHASE</span>
      <span className={styles.value}>{fact.hero.value}</span>
      <span className={styles.word}>{fact.hero.word}</span>
      {more > 0 && <span className={styles.more}>+{more} MORE</span>}
      <span className={styles.arrow} aria-hidden="true">→</span>
    </button>
  );
}
