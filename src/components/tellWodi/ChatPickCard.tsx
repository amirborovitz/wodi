import { useState } from 'react';
import { motion } from 'framer-motion';
import { pickAnswer, type ChatChip, type ChatPick } from './chatQuestions';
import styles from './TellWodiChat.module.css';

interface ChatPickCardProps {
  pick: ChatPick;
  disabled: boolean;
  onAnswer: (chip: ChatChip) => void;
}

/**
 * The moves of the unfinished round: tap each one finished, in any order, then confirm. The moves
 * are chips; the confirm is a full-width button under them — an action, never read as one more
 * option — and says what it saves ("Just 6 rounds", "Confirm 2 moves"). What's ticked is the only
 * state here; the answer is pickAnswer's.
 */
export function ChatPickCard({ pick, disabled, onAnswer }: ChatPickCardProps): React.ReactElement {
  const [ticked, setTicked] = useState<string[]>([]);
  const toggle = (value: string): void => {
    setTicked((now) => (now.includes(value) ? now.filter((v) => v !== value) : [...now, value]));
  };
  const answer = pickAnswer(pick, ticked);
  return (
    <div className={styles.pick}>
      <div className={styles.chips}>
        {pick.options.map((option) => {
          const on = ticked.includes(option.value);
          return (
            <motion.button
              key={option.value}
              type="button"
              className={on ? styles.chipOn : styles.chip}
              aria-pressed={on}
              whileTap={{ scale: 0.97 }}
              disabled={disabled}
              onClick={() => toggle(option.value)}
            >
              {on && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M2.5 7.5l3 3 6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {option.label}
            </motion.button>
          );
        })}
      </div>
      <motion.button
        type="button"
        className={styles.confirm}
        whileTap={{ scale: 0.98 }}
        disabled={disabled}
        onClick={() => onAnswer(answer.chip)}
      >
        {answer.button}
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M3 9h12M10 4l5 5-5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </motion.button>
    </div>
  );
}
