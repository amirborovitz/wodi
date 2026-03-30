import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StickerCard } from './StickerCard';
import styles from './ShareLaunchSheet.module.css';
import type { RewardData, Exercise } from '../../types';
import {
  buildShareSegments,
  buildMovementLine,
  formatTime,
  formatVolume,
  isExcludedExercise,
  detectExerciseDisplayType,
} from './shareCardUtils';

interface ShareLaunchSheetProps {
  open: boolean;
  onClose: () => void;
  data: RewardData;
  userName?: string;
}

const SCREENSHOT_HINTS = [
  'Screenshot this & flex on your story',
  'Screenshot it. Post it. Own it.',
  'Take a screenshot & show the world',
  'Screenshot this card, you earned it',
  'Grab a screenshot & share the gains',
];

// ---------------------------------------------------------------------------
// Text export helpers
// ---------------------------------------------------------------------------

function buildExerciseTextLine(ex: Exercise): string {
  const sets = (ex.sets || []).filter(s => s.completed);
  const displaySets = sets.length > 0 ? sets : ex.sets || [];
  const exType = detectExerciseDisplayType(ex);
  const nameLine = ex.name.toUpperCase();

  if (exType === 'strength') {
    const weights = displaySets.map(s => s.weight).filter((w): w is number => w != null);
    const reps = displaySets.map(s => s.actualReps).filter((r): r is number => r != null);
    const allSameWeight = weights.length > 0 && weights.every(w => w === weights[0]);
    const allSameReps = reps.length > 0 && reps.every(r => r === reps[0]);

    let setLine: string;
    if (allSameWeight && allSameReps && weights.length > 0) {
      setLine = `${displaySets.length}x${reps[0]} @ ${weights[0]}kg`;
    } else if (!allSameWeight && allSameReps && weights.length > 1) {
      setLine = `${displaySets.length}x${reps[0]} @ ${weights.join('>')}kg`;
    } else {
      setLine = displaySets.map(s => {
        const w = s.weight != null ? `${s.weight}kg` : '';
        const r = s.actualReps != null ? `${s.actualReps}` : '';
        return w && r ? `${w} x ${r}` : w || r;
      }).filter(Boolean).join(' · ');
    }
    return `${nameLine}\n${setLine}`;
  }

  if (exType === 'for_time') {
    const timeSet = displaySets.find(s => s.time != null && s.time > 0);
    const timeStr = timeSet ? formatTime(timeSet.time || 0) : '';
    const lines = [nameLine];
    if (timeStr) lines.push(timeStr);
    if (ex.movements?.length) {
      ex.movements.forEach(m => {
        const p: string[] = [];
        if (m.reps) p.push(`${m.reps}`);
        p.push(m.name);
        if (m.rxWeights) p.push(`@${m.rxWeights.male || m.rxWeights.female}${m.rxWeights.unit || 'kg'}`);
        lines.push(`  ${p.join(' ')}`);
      });
    } else if (ex.prescription) {
      lines.push(ex.prescription);
    }
    return lines.join('\n');
  }

  if (exType === 'amrap') {
    // Prefer exercise.rounds (story logging stores rounds there, not as individual sets)
    const totalRounds = ex.rounds || displaySets.filter(s => s.completed).length;
    const lastSet = displaySets[displaySets.length - 1];
    const extraReps = lastSet?.actualReps || 0;
    const score = totalRounds > 0 ? `${totalRounds} rds${extraReps > 0 ? ` + ${extraReps}` : ''}` : '';
    const lines = [nameLine];
    if (score) lines.push(score);
    if (ex.movements?.length) {
      ex.movements.forEach(m => {
        const p: string[] = [];
        if (m.reps) p.push(`${m.reps}`);
        p.push(m.name);
        if (m.rxWeights) p.push(`@${m.rxWeights.male || m.rxWeights.female}${m.rxWeights.unit || 'kg'}`);
        lines.push(`  ${p.join(' ')}`);
      });
    } else if (ex.prescription) {
      lines.push(ex.prescription);
    }
    return lines.join('\n');
  }

  if (exType === 'cardio') {
    const totalCal = displaySets.reduce((a, s) => a + (s.calories || 0), 0);
    const totalDist = displaySets.reduce((a, s) => a + (s.distance || 0), 0);
    const metric = totalCal > 0 ? `${totalCal} cal` : totalDist > 0 ? `${totalDist}m` : '';
    return `${nameLine}\n${metric ? `${metric} | ` : ''}${ex.prescription || ''}`;
  }

  const repStrs = displaySets
    .map(s => (s.actualReps != null ? `${s.actualReps} reps` : ''))
    .filter(Boolean);
  return `${nameLine}\n${repStrs.join(', ') || ex.prescription || ''}`;
}

function buildWorkoutText(data: RewardData): string {
  const { workoutSummary, exercises, workloadBreakdown } = data;
  const movements = workloadBreakdown?.movements || [];
  const filtered = exercises.filter(ex => !isExcludedExercise(ex));

  const lines: string[] = [workoutSummary.title.toUpperCase()];

  const isMetcon = filtered.length <= 2 && movements.length > 1;
  if (isMetcon) {
    if (filtered[0]) lines.push(filtered[0].name.toUpperCase());
    movements.forEach(mov => {
      lines.push(`  ${buildMovementLine(mov)}`);
    });
  } else {
    filtered.forEach(ex => {
      lines.push(buildExerciseTextLine(ex));
    });
  }

  const statParts: string[] = [];
  // Partner workouts: divide by teamSize for personal share
  const teamSize = data.teamSize && data.teamSize > 1 ? data.teamSize : 1;
  const totalVolume = Math.round((workloadBreakdown?.grandTotalVolume || workoutSummary.totalVolume || 0) / teamSize);
  const totalReps = Math.round((workloadBreakdown?.grandTotalReps || workoutSummary.totalReps || 0) / teamSize);

  if (workoutSummary.duration) {
    const totalSec = Math.round(workoutSummary.duration * 60);
    statParts.push(`Time: ${formatTime(totalSec)}`);
  }
  if (totalVolume > 0) statParts.push(`Volume: ${formatVolume(totalVolume)}`);
  if (totalReps > 0) statParts.push(`${totalReps} reps`);

  if (statParts.length > 0) {
    lines.push('');
    lines.push(statParts.join(' | '));
  }

  lines.push('#wodi');
  return lines.join('\n');
}

function buildWorkoutLink(): string {
  if (typeof window === 'undefined') return '';
  try {
    const url = new URL(window.location.href);
    url.hash = '';
    url.searchParams.set('utm_source', 'wodi_share');
    return url.toString();
  } catch {
    return window.location.href;
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s ease' }}
    >
      <polyline points="6 9 12 15 18 9" />
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
// Slide animation variants
// ---------------------------------------------------------------------------

const slideVariants = {
  enter: (d: number) => ({ x: d >= 0 ? 120 : -120, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d >= 0 ? -120 : 120, opacity: 0 }),
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ShareLaunchSheet({ open, onClose, data, userName }: ShareLaunchSheetProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [copied, setCopied] = useState(false);
  const [textExpanded, setTextExpanded] = useState(false);
  const [hint] = useState(() => SCREENSHOT_HINTS[Math.floor(Math.random() * SCREENSHOT_HINTS.length)]);

  // Build segments: Story (always) + Strength (conditional) + Metcon (conditional)
  const segments = buildShareSegments(data);
  const totalSegments = segments.length;

  const goTo = useCallback(
    (newIndex: number) => {
      if (newIndex < 0 || newIndex >= totalSegments) return;
      setDirection(newIndex > currentIndex ? 1 : -1);
      setCurrentIndex(newIndex);
      setTextExpanded(false);
    },
    [currentIndex, totalSegments]
  );

  useEffect(() => {
    if (open) {
      setCurrentIndex(0);
      setDirection(0);
      setCopied(false);
      setTextExpanded(false);
    }
  }, [open]);

  const handleCopyText = async () => {
    const text = buildWorkoutText(data);
    const link = buildWorkoutLink();
    const ok = await copyText(`${text}\n\n${link}`);
    if (!ok) return;
    setCopied(true);
    navigator.vibrate?.(10);
    setTimeout(() => setCopied(false), 2000);
  };

  const textPreview = buildWorkoutText(data);
  const currentSegment = segments[currentIndex] || segments[0];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            className={styles.sheet}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 380 }}
          >
            <button className={styles.closeBtn} onClick={onClose} type="button" aria-label="Close">
              <CloseIcon />
            </button>

            <p className={styles.screenshotHint}>{hint}</p>

            {/* Card area */}
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
                      if (offset.x < -50 || velocity.x < -500) goTo(currentIndex + 1);
                      else if (offset.x > 50 || velocity.x > 500) goTo(currentIndex - 1);
                    }}
                  >
                    <StickerCard
                      data={data}
                      userName={userName}
                      segment={currentSegment.type}
                      exercises={currentSegment.exercises}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Colored dot indicators */}
            {totalSegments > 1 && (
              <div className={styles.dotsRow}>
                {segments.map((seg, i) => (
                  <button
                    key={i}
                    className={`${styles.dot} ${i === currentIndex ? styles.dotActive : ''}`}
                    style={
                      i === currentIndex
                        ? { background: seg.color, boxShadow: `0 0 6px ${seg.color}66` }
                        : undefined
                    }
                    onClick={() => goTo(i)}
                    type="button"
                    aria-label={seg.label}
                  />
                ))}
              </div>
            )}

            {/* Copy text expander */}
            <div className={styles.copySection}>
              <button
                className={styles.copyToggle}
                onClick={() => setTextExpanded(!textExpanded)}
                type="button"
              >
                <span className={styles.copyToggleLabel}>Workout text</span>
                <ChevronIcon expanded={textExpanded} />
              </button>

              <AnimatePresence>
                {textExpanded && (
                  <motion.div
                    className={styles.textPreview}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                  >
                    <pre className={styles.textContent}>{textPreview}</pre>
                    <button
                      className={`${styles.copyBtn} ${copied ? styles.copyBtnDone : ''}`}
                      onClick={handleCopyText}
                      type="button"
                    >
                      {copied ? <><CheckIcon /> Copied</> : <><CopyIcon /> Copy text</>}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button className={styles.doneBtn} onClick={onClose} type="button">
              Done
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
