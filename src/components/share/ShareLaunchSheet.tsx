import { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StickerCard } from './StickerCard';
import { CopyTextSheet } from './CopyTextSheet';
import { elementToCanvas, canvasToBlob, copyImageToClipboard } from '../../utils/shareUtils';
import styles from './ShareLaunchSheet.module.css';
import type { RewardData, Exercise } from '../../types';

interface ShareLaunchSheetProps {
  open: boolean;
  onClose: () => void;
  data: RewardData;
  userName?: string;
}

// ---------------------------------------------------------------------------
// Icon SVGs
// ---------------------------------------------------------------------------

function CopyImageIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function CopyTextIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function CaptureIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h3l2-2h6l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Segment type + slide variants
// ---------------------------------------------------------------------------

type Segment = 'full' | number;

const slideVariants = {
  enter: (d: number) => ({ x: d >= 0 ? 120 : -120, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d >= 0 ? -120 : 120, opacity: 0 }),
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ShareLaunchSheet({ open, onClose, data, userName }: ShareLaunchSheetProps) {
  const exercises = data.exercises || [];

  // --- swipe carousel state ---
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0); // -1 = left, 1 = right
  const totalSegments = 1 + exercises.length; // 'full' + each exercise

  // Derive segment from index
  const segment: Segment = currentIndex === 0 ? 'full' : currentIndex - 1;

  // Build labels for dots / cards
  const segmentLabels = ['Full Workout', ...exercises.map(ex => getSegmentLabel(ex))];

  const goTo = useCallback((newIndex: number) => {
    if (newIndex < 0 || newIndex >= totalSegments) return;
    setDirection(newIndex > currentIndex ? 1 : -1);
    setCurrentIndex(newIndex);
  }, [currentIndex, totalSegments]);

  // --- action feedback ---
  const [isCopying, setIsCopying] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<'image' | 'text' | null>(null);

  // --- child sheet state ---
  const [isCopyTextOpen, setIsCopyTextOpen] = useState(false);
  const [isCaptureViewOpen, setIsCaptureViewOpen] = useState(false);

  // --- hidden export target ref ---
  const exportRef = useRef<HTMLDivElement>(null);

  // Reset index when sheet opens
  useEffect(() => {
    if (open) {
      setCurrentIndex(0);
      setDirection(0);
    }
  }, [open]);

  // --- action handlers ---

  const handleCopyImage = async () => {
    if (isCopying) return;
    setIsCopying(true);
    setCopyFeedback(null);

    try {
      if (!exportRef.current) return;
      const canvas = await elementToCanvas(exportRef.current, { scale: 3 });
      const blob = await canvasToBlob(canvas, 'png', 0.95);
      const ok = await copyImageToClipboard(blob);
      if (ok) {
        setCopyFeedback('image');
        setTimeout(() => setCopyFeedback(null), 1800);
      }
    } catch {
      // silent
    } finally {
      setIsCopying(false);
    }
  };

  // --- icon row data ---
  const iconActions = [
    { id: 'copyImage' as const, label: 'Copy Image', Icon: CopyImageIcon, handler: handleCopyImage },
    { id: 'copyText' as const, label: 'Copy Text', Icon: CopyTextIcon, handler: () => setIsCopyTextOpen(true) },
    { id: 'captureView' as const, label: 'Capture View', Icon: CaptureIcon, handler: () => setIsCaptureViewOpen(true) },
  ];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              className={styles.backdrop}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />

            {/* Bottom sheet */}
            <motion.div
              className={styles.sheet}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 380 }}
            >
              {/* Drag handle */}
              <div className={styles.dragHandle} aria-hidden="true" />

              {/* Header row */}
              <div className={styles.sheetHeader}>
                <h2 className={styles.sheetTitle}>Share workout</h2>
                <button
                  className={styles.closeBtn}
                  onClick={onClose}
                  type="button"
                  aria-label="Close"
                >
                  <CloseIcon />
                </button>
              </div>

              {/* ---- Swipeable Card Area ---- */}
              <div className={styles.cardSwipeArea}>
                <div className={styles.cardArea}>
                  <AnimatePresence mode="wait" custom={direction}>
                    <motion.div
                      key={currentIndex}
                      className={styles.cardScaler}
                      custom={direction}
                      variants={slideVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                      drag={totalSegments > 1 ? 'x' : false}
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={0.15}
                      onDragEnd={(_e, info) => {
                        const { offset, velocity } = info;
                        if (offset.x < -50 || velocity.x < -500) {
                          goTo(currentIndex + 1);
                        } else if (offset.x > 50 || velocity.x > 500) {
                          goTo(currentIndex - 1);
                        }
                      }}
                    >
                      <StickerCard
                        data={data}
                        userName={userName}
                        segment={segment}
                        label={segment !== 'full' ? segmentLabels[currentIndex] : undefined}
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>

              {/* ---- Dot Indicators ---- */}
              {totalSegments > 1 && (
                <div className={styles.dotsRow}>
                  {segmentLabels.map((_, i) => (
                    <button
                      key={i}
                      className={`${styles.dot} ${i === currentIndex ? styles.dotActive : ''}`}
                      onClick={() => goTo(i)}
                      type="button"
                      aria-label={segmentLabels[i]}
                    />
                  ))}
                </div>
              )}

              <p className={styles.nativeShareHint}>
                Native app sharing is not available in web mode yet. Use copy or capture view.
              </p>

              {/* ---- Icon Action Row ---- */}
              <div className={styles.iconRow}>
                {iconActions.map(({ id, label, Icon, handler }) => (
                  <button
                    key={id}
                    className={styles.iconBtn}
                    onClick={handler}
                    disabled={isCopying && id === 'copyImage'}
                    type="button"
                    aria-label={label}
                  >
                    <div className={`${styles.iconBtnCircle} ${copyFeedback === 'image' && id === 'copyImage' ? styles.iconBtnCircleSuccess : ''}`}>
                      {copyFeedback === 'image' && id === 'copyImage' ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00d4aa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <Icon />
                      )}
                    </div>
                    <span className={styles.iconBtnLabel}>{label}</span>
                  </button>
                ))}
              </div>

              {/* ---- Done button ---- */}
              <button
                className={styles.doneBtn}
                onClick={onClose}
                type="button"
              >
                Done
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ---- Child sheet: CopyTextSheet with segment context ---- */}
      <CopyTextSheet
        open={isCopyTextOpen}
        onClose={() => setIsCopyTextOpen(false)}
        data={data}
        segment={segment}
      />

      <AnimatePresence>
        {isCaptureViewOpen && (
          <>
            <motion.div
              className={styles.captureBackdrop}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCaptureViewOpen(false)}
            />
            <motion.div
              className={styles.captureView}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.18 }}
            >
              <button
                className={styles.captureCloseBtn}
                onClick={() => setIsCaptureViewOpen(false)}
                type="button"
              >
                Close
              </button>
              <div className={styles.captureCardWrap}>
                <StickerCard
                  data={data}
                  userName={userName}
                  segment={segment}
                  label={segment !== 'full' ? segmentLabels[currentIndex] : undefined}
                />
              </div>
              <p className={styles.captureHint}>Take a screenshot now</p>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ---- Hidden 3x export target (off-screen) ---- */}
      <div className={styles.exportTarget} aria-hidden="true">
        <div ref={exportRef}>
          <StickerCard
            data={data}
            userName={userName}
            segment={segment}
            label={segment !== 'full' ? segmentLabels[currentIndex] : undefined}
          />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSegmentLabel(exercise: Exercise): string {
  switch (exercise.type) {
    case 'strength': return 'Strength';
    case 'wod': return 'Metcon';
    case 'cardio': return 'Cardio';
    case 'skill': return 'Skill';
    default: return 'Workout';
  }
}
