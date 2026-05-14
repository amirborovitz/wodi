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
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className={styles.blockLeft}>
                <span className={styles.blockType}>{block.typeLabel}</span>
                <span className={styles.blockName}>{block.displayName}</span>
              </div>
              <span className={styles.blockChevron}>{'>'}</span>
            </motion.button>
          ))}
        </div>

        <button
          type="button"
          className={styles.skipAll}
          onClick={onSkipAll}
        >
          Skip all -&gt; just mark complete
        </button>
      </div>
    </motion.div>
  );
}
