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
 * The moves of the unfinished round: tap each one finished, in any order, then confirm. The
 * confirm says what it saves ("None of it", "Done · 2 moves") — what's ticked is the only state
 * here; the answer is pickAnswer's.
 */
export function ChatPickCard({ pick, disabled, onAnswer }: ChatPickCardProps): React.ReactElement {
  const [ticked, setTicked] = useState<string[]>([]);
  const toggle = (value: string): void => {
    setTicked((now) => (now.includes(value) ? now.filter((v) => v !== value) : [...now, value]));
  };
  const answer = pickAnswer(pick, ticked);
  return (
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
            {on && <span className={styles.chipTick} aria-hidden="true">✓</span>}
            {option.label}
          </motion.button>
        );
      })}
      <motion.button
        type="button"
        className={ticked.length > 0 ? styles.chipPrimary : styles.chipSkip}
        whileTap={{ scale: 0.97 }}
        disabled={disabled}
        onClick={() => onAnswer(answer.chip)}
      >
        {answer.button}
      </motion.button>
    </div>
  );
}
