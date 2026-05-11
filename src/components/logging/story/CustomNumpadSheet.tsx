import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import styles from './CustomNumpadSheet.module.css';

interface CustomNumpadSheetProps {
  open: boolean;
  label: string;
  value: string;
  unit?: string;
  accentColor: string;
  onDigit: (digit: string) => void;
  showDecimal?: boolean;
  onBackspace: () => void;
  onNext: () => void;
  onClose: () => void;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

function BackspaceIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 7H20V17H9L4 12L9 7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M11.5 9.5L16.5 14.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M16.5 9.5L11.5 14.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CustomNumpadSheet({
  open,
  label,
  value,
  unit,
  accentColor,
  onDigit,
  showDecimal = false,
  onBackspace,
  onNext,
  onClose,
}: CustomNumpadSheetProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
        >
          <motion.div
            className={styles.sheet}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            drag="y"
            dragDirectionLock
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.18 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 700) {
                onClose();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            style={{ '--numpad-accent': accentColor } as CSSProperties}
          >
            <div className={styles.handle} />
            <div className={styles.header}>
              <span className={styles.label}>{label}</span>
              <div className={styles.valueRow}>
                <span className={styles.value}>{value || '0'}</span>
                {unit ? <span className={styles.unit}>{unit}</span> : null}
              </div>
            </div>

            <div className={styles.grid}>
              {DIGITS.map((digit) => (
                <button
                  key={digit}
                  type="button"
                  className={styles.key}
                  onClick={() => onDigit(digit)}
                >
                  {digit}
                </button>
              ))}

              {showDecimal ? (
                <button
                  type="button"
                  className={`${styles.key} ${styles.utilityKey}`}
                  onClick={() => onDigit('.')}
                  aria-label="Decimal point"
                >
                  .
                </button>
              ) : (
                <button
                  type="button"
                  className={`${styles.key} ${styles.utilityKey}`}
                  disabled
                  aria-hidden="true"
                />
              )}

              <button
                type="button"
                className={styles.key}
                onClick={() => onDigit('0')}
              >
                0
              </button>

              <button
                type="button"
                className={`${styles.key} ${styles.utilityKey}`}
                onClick={onBackspace}
                aria-label="Backspace"
              >
                <BackspaceIcon />
              </button>

              <button
                type="button"
                className={styles.nextKey}
                onClick={onNext}
              >
                NEXT
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
