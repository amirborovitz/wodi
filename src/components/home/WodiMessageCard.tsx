import type React from 'react';
import { WodiText } from '../tellWodi/WodiText';
import chat from '../tellWodi/TellWodiChat.module.css';
import styles from './WodiMessageCard.module.css';

interface WodiMessageCardProps {
  text: string;
  /** The one value in yellow, as the message names it. */
  highlight: string | null;
  /** What the message is about: Chase, or the thread to answer it. */
  onOpen: () => void;
  /** The day it's about ("30 Jun") opens that poster — the message's receipt. */
  link?: { text: string; onOpen: () => void };
}

/**
 * Top of Today: Wodi's newest message, as the exact bubble that ends the thread — sender name
 * outside it, the tail corner, its key number in yellow. A message, not a widget: no header
 * label and no "reply" button, because the bar below is how you answer. When its day can open a
 * poster, that word is the tap target (a button can't hold another button).
 */
export function WodiMessageCard({ text, highlight, onOpen, link }: WodiMessageCardProps): React.ReactElement {
  return (
    <section className={styles.message} aria-label="Message from Wodi">
      <div className={styles.sender}>
        <span className={styles.mark}>wodi<span className={styles.dot}>.</span></span>
      </div>
      {link ? (
        <div className={`${chat.bubbleWodi} ${styles.bubble}`}>
          <p className={chat.text}><WodiText text={text} highlight={highlight} link={link} /></p>
        </div>
      ) : (
        <button type="button" className={`${chat.bubbleWodi} ${styles.bubble} ${styles.bubbleButton}`} onClick={onOpen}>
          <span className={chat.text}><WodiText text={text} highlight={highlight} /></span>
        </button>
      )}
    </section>
  );
}
