import { motion } from 'framer-motion';
import styles from './WizardOverview.module.css';
import type { WizardBlock } from './StoryLogResults';

interface WizardOverviewProps {
  blocks: WizardBlock[];
  onSelect: (blockIdx: number) => void;
  onSkipAll: () => void;
  onBack: () => void;
}

export function WizardOverview({ blocks, onSelect, onSkipAll, onBack }: WizardOverviewProps) {
  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    >
      <button
        type="button"
        className={styles.backBtn}
        onClick={onBack}
        aria-label="Back"
      >
        {'<'}
      </button>

      <div className={styles.inner}>
        <p className={styles.eyebrow}>TODAY'S WORK</p>
        <h1 className={styles.title}>Where do you want to start?</h1>

        <div className={styles.blockList}>
          {blocks.map((block, idx) => (
            <motion.button
              key={idx}
              type="button"
              className={styles.blockCard}
              onClick={() => onSelect(idx)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26, delay: idx * 0.06, ease: [0.16, 1, 0.3, 1] }}
              whileTap={{ scale: 0.975 }}
            >
              {/* Badge above; name+chevron on the same row → chevron aligns with name */}
              <span className={styles.blockType}>{block.typeLabel}</span>
              <div className={styles.nameRow}>
                <span className={styles.blockName}>{block.displayName}</span>
                <span className={styles.blockChevron} aria-hidden>›</span>
              </div>
            </motion.button>
          ))}
        </div>

        <button
          type="button"
          className={styles.skipAll}
          onClick={onSkipAll}
        >
          Skip all → just mark complete
        </button>
      </div>
    </motion.div>
  );
}
