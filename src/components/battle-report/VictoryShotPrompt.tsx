import { useRef } from 'react';
import { motion } from 'framer-motion';
import styles from './VictoryShotPrompt.module.css';

interface VictoryShotPromptProps {
  onCapture: (file: File) => void;
}

export function VictoryShotPrompt({ onCapture }: VictoryShotPromptProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onCapture(file);
  };

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <button
        type="button"
        className={styles.captureButton}
        onClick={() => inputRef.current?.click()}
      >
        <span className={styles.cameraIcon}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </span>
        <span className={styles.captureLabel}>Capture Victory Shot</span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className={styles.hiddenInput}
        onChange={handleCapture}
      />
    </motion.div>
  );
}
