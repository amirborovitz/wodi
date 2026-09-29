import { motion } from 'framer-motion';
import type { SavedChat } from '../../types';
import styles from './TellWodiChat.module.css';

interface ChatTranscriptSheetProps {
  chat: SavedChat;
  title: string;
  onClose: () => void;
}

/**
 * The conversation a workout was logged in, read back from its poster. Read-only: fixing a log by
 * chatting after the poster exists is a later step (see the Tell Wodi plan). Same bubbles as the
 * live chat, so it reads as the conversation the athlete remembers.
 */
export function ChatTranscriptSheet({ chat, title, onClose }: ChatTranscriptSheetProps) {
  return (
    <motion.div
      className={styles.screen}
      style={{ zIndex: 1100 }}
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 38 }}
    >
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onClose} aria-label="Close conversation">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className={styles.title}>{title}</h1>
      </header>
      <div className={styles.thread}>
        <div className={styles.threadContent}>
        {chat.messages.map((message, i) => (
          <div key={`${message.at}-${i}`} className={message.from === 'me' ? styles.rowMe : styles.rowWodi}>
            <div className={message.from === 'me' ? styles.bubbleMe : styles.bubbleWodi}>
              {message.hadPhoto && <p className={styles.photoNote}>Board photo</p>}
              {message.text && <p className={styles.text}>{message.text}</p>}
            </div>
          </div>
        ))}
        </div>
      </div>
    </motion.div>
  );
}
