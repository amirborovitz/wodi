import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StickerCard } from './StickerCard';
import styles from './ShareLaunchSheet.module.css';
import type { RewardData, Exercise, MovementTotal } from '../../types';

interface ShareLaunchSheetProps {
  open: boolean;
  onClose: () => void;
  data: RewardData;
  userName?: string;
}

type Segment = 'full' | number;
type ExType = 'strength' | 'for_time' | 'amrap' | 'cardio' | 'bodyweight';

function buildMovementLine(mov: MovementTotal): string {
  const parts: string[] = [];
  if (mov.totalReps && mov.totalReps > 0) parts.push(`${mov.totalReps}`);
  if (mov.totalDistance && mov.totalDistance > 0) {
    parts.push(
      mov.totalDistance >= 1000
        ? `${(mov.totalDistance / 1000).toFixed(1)}km`
        : `${Math.round(mov.totalDistance)}m`
    );
  }
  if (mov.totalCalories && mov.totalCalories > 0) parts.push(`${mov.totalCalories} cal`);
  if (mov.weight && mov.weight > 0) parts.push(`@ ${mov.weight}kg`);
  const detail = parts.length > 0 ? ` - ${parts.join(' ')}` : '';
  return `${mov.name}${detail}`;
}

function formatTime(totalSeconds: number): string {
  if (totalSeconds === 0) return '--';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const rm = mins % 60;
    return `${hrs}:${rm.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatVolume(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} tons`;
  return `${parseFloat(kg.toFixed(1)).toLocaleString()}kg`;
}

function detectExerciseType(ex: Exercise): ExType {
  const sets = ex.sets || [];
  const hasWeight = sets.some((s) => s.weight != null && s.weight > 0);
  const hasTime = sets.some((s) => s.time != null && s.time > 0);
  const hasCals = sets.some((s) => s.calories != null && s.calories > 0);
  const hasDist = sets.some((s) => s.distance != null && s.distance > 0);

  const rx = (ex.prescription || '').toLowerCase();
  if (rx.includes('amrap')) return 'amrap';
  if (rx.includes('for time') || rx.includes('for_time')) return 'for_time';
  if (hasWeight) return 'strength';
  if (hasCals || hasDist) return 'cardio';
  if (hasTime && !hasWeight) return 'for_time';
  return 'bodyweight';
}

function buildExerciseLine(ex: Exercise): string {
  const sets = (ex.sets || []).filter((s) => s.completed);
  const displaySets = sets.length > 0 ? sets : ex.sets || [];
  const exType = detectExerciseType(ex);

  const nameLine = ex.name.toUpperCase();

  if (exType === 'strength') {
    const setStrs = displaySets
      .map((s) => {
        const parts: string[] = [];
        if (s.weight != null) parts.push(`${s.weight}kg`);
        if (s.actualReps != null) parts.push(`x ${s.actualReps}`);
        return parts.join(' ');
      })
      .filter(Boolean);

    const prescription = ex.prescription ? `${ex.prescription} | ` : '';
    return `${nameLine}\n${prescription}${setStrs.join(', ')}`;
  }

  if (exType === 'for_time') {
    const timeSet = displaySets.find((s) => s.time != null && s.time > 0);
    const timeStr = timeSet ? formatTime(timeSet.time || 0) : '';
    const parts = [nameLine];
    if (timeStr) parts.push(`${timeStr} | ${ex.prescription}`);
    else parts.push(ex.prescription);
    return parts.join('\n');
  }

  if (exType === 'amrap') {
    const totalRounds = displaySets.filter((s) => s.completed).length;
    const lastSet = displaySets[displaySets.length - 1];
    const extraReps = lastSet?.actualReps || 0;
    const score =
      totalRounds > 0
        ? `${totalRounds} rounds${extraReps > 0 ? ` + ${extraReps} reps` : ''}`
        : '';
    return `${nameLine}\n${score ? `${score} | ` : ''}${ex.prescription}`;
  }

  if (exType === 'cardio') {
    const totalCal = displaySets.reduce((a, s) => a + (s.calories || 0), 0);
    const totalDist = displaySets.reduce((a, s) => a + (s.distance || 0), 0);
    const metric = totalCal > 0 ? `${totalCal} cal` : totalDist > 0 ? `${totalDist}m` : '';
    return `${nameLine}\n${metric ? `${metric} | ` : ''}${ex.prescription}`;
  }

  const repStrs = displaySets
    .map((s) => (s.actualReps != null ? `${s.actualReps} reps` : ''))
    .filter(Boolean);
  return `${nameLine}\n${repStrs.join(', ') || ex.prescription}`;
}

function buildSingleExerciseText(ex: Exercise): string {
  const sets = (ex.sets || []).filter((s) => s.completed);
  const displaySets = sets.length > 0 ? sets : ex.sets || [];
  const exType = detectExerciseType(ex);
  const lines: string[] = [ex.name.toUpperCase()];

  if (exType === 'strength') {
    displaySets.forEach((s, i) => {
      const parts: string[] = [];
      if (s.weight != null) parts.push(`${s.weight}kg`);
      if (s.actualReps != null) parts.push(`x ${s.actualReps}`);
      lines.push(`Set ${s.setNumber || i + 1}: ${parts.join(' ')}`);
    });

    const vol = displaySets.reduce((a, s) => {
      if (s.weight && s.actualReps) return a + s.weight * s.actualReps;
      return a;
    }, 0);
    if (vol > 0) {
      lines.push('');
      lines.push(`Volume: ${formatVolume(vol)}`);
    }
  } else if (exType === 'for_time') {
    const timeSet = displaySets.find((s) => s.time != null && s.time > 0);
    if (timeSet) lines.push(`${formatTime(timeSet.time || 0)} completed`);
    if (ex.prescription) lines.push(ex.prescription);
  } else if (exType === 'amrap') {
    const totalRounds = displaySets.filter((s) => s.completed).length;
    const lastSet = displaySets[displaySets.length - 1];
    const extraReps = lastSet?.actualReps || 0;
    if (totalRounds > 0) {
      lines.push(`${totalRounds} rounds${extraReps > 0 ? ` + ${extraReps} reps` : ''}`);
    }
    if (ex.prescription) lines.push(ex.prescription);
  } else if (exType === 'cardio') {
    const totalCal = displaySets.reduce((a, s) => a + (s.calories || 0), 0);
    const totalDist = displaySets.reduce((a, s) => a + (s.distance || 0), 0);
    if (totalCal > 0) lines.push(`${totalCal} cal`);
    else if (totalDist > 0) lines.push(`${totalDist}m`);
  } else {
    displaySets.forEach((s, i) => {
      if (s.actualReps != null) {
        lines.push(`Set ${s.setNumber || i + 1}: ${s.actualReps} reps`);
      }
    });
  }

  return lines.join('\n');
}

function buildWorkoutText(data: RewardData, segment: Segment): string {
  const { workoutSummary, exercises, workloadBreakdown } = data;
  const movements = workloadBreakdown?.movements || [];

  if (segment !== 'full') {
    const ex = exercises[segment];
    if (!ex) return workoutSummary.title;
    return buildSingleExerciseText(ex);
  }

  const lines: string[] = [workoutSummary.title.toUpperCase()];

  const isMetcon = exercises.length <= 2 && movements.length > 1;
  if (isMetcon) {
    if (exercises[0]) lines.push(exercises[0].name.toUpperCase());
    movements.forEach((mov) => {
      lines.push(buildMovementLine(mov));
    });
  } else {
    exercises.forEach((ex) => {
      lines.push(buildExerciseLine(ex));
    });
  }

  const statParts: string[] = [];
  const totalVolume = workloadBreakdown?.grandTotalVolume || workoutSummary.totalVolume || 0;
  const totalReps = workloadBreakdown?.grandTotalReps || workoutSummary.totalReps || 0;

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

function openDeepLink(url: string, fallbackUrl?: string) {
  window.location.href = url;
  if (fallbackUrl) {
    window.setTimeout(() => {
      window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
    }, 700);
  }
}

function InstagramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="18.2" cy="5.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
      <path d="M5 19h14" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 5" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 19" />
    </svg>
  );
}

function CopyTextIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l16 16" />
      <path d="M20 4 4 20" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
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

const slideVariants = {
  enter: (d: number) => ({ x: d >= 0 ? 120 : -120, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d >= 0 ? -120 : 120, opacity: 0 }),
};

function getSegmentLabel(exercise: Exercise): string {
  switch (exercise.type) {
    case 'strength':
      return 'Strength';
    case 'wod':
      return 'Metcon';
    case 'cardio':
      return 'Cardio';
    case 'skill':
      return 'Skill';
    default:
      return 'Workout';
  }
}

export function ShareLaunchSheet({ open, onClose, data, userName }: ShareLaunchSheetProps) {
  const exercises = data.exercises || [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isPrimaryBusy, setIsPrimaryBusy] = useState(false);
  const [primaryDone, setPrimaryDone] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<'text' | 'link' | null>(null);

  const totalSegments = 1 + exercises.length;
  const segment: Segment = currentIndex === 0 ? 'full' : currentIndex - 1;
  const segmentLabels = ['Full Workout', ...exercises.map((ex) => getSegmentLabel(ex))];

  const goTo = useCallback(
    (newIndex: number) => {
      if (newIndex < 0 || newIndex >= totalSegments) return;
      setDirection(newIndex > currentIndex ? 1 : -1);
      setCurrentIndex(newIndex);
    },
    [currentIndex, totalSegments]
  );

  useEffect(() => {
    if (open) {
      setCurrentIndex(0);
      setDirection(0);
      setPrimaryDone(false);
      setCopyFeedback(null);
    }
  }, [open]);

  const getPayload = () => {
    const title = data.workoutSummary?.title || 'Workout';
    const text = buildWorkoutText(data, segment);
    const link = buildWorkoutLink();
    return { title, text, link };
  };

  const handleInstagram = async () => {
    if (isPrimaryBusy || primaryDone) return;
    setIsPrimaryBusy(true);
    try {
      const { text, link } = getPayload();
      await copyText(`${text}\n\n${link}`);
      openDeepLink('instagram://story-camera', 'https://www.instagram.com/create/story/');
      setPrimaryDone(true);
      navigator.vibrate?.(10);
      setTimeout(() => setPrimaryDone(false), 2200);
    } finally {
      setIsPrimaryBusy(false);
    }
  };

  const handleMore = async () => {
    const { title, text, link } = getPayload();
    try {
      if (navigator.share) {
        await navigator.share({
          title,
          text,
          url: link,
        });
        return;
      }

      await copyText(`${text}\n\n${link}`);
      setCopyFeedback('text');
      setTimeout(() => setCopyFeedback(null), 1800);
    } catch {
      // user canceled share
    }
  };

  const handleWorkoutLink = async () => {
    const { link } = getPayload();
    const ok = await copyText(link);
    if (!ok) return;
    setCopyFeedback('link');
    navigator.vibrate?.(10);
    setTimeout(() => setCopyFeedback(null), 1800);
  };

  const handleCopyText = async () => {
    const { text, link } = getPayload();
    const ok = await copyText(`${text}\n\n${link}`);
    if (!ok) return;
    setCopyFeedback('text');
    navigator.vibrate?.(10);
    setTimeout(() => setCopyFeedback(null), 1800);
  };

  const handleX = () => {
    const { text, link } = getPayload();
    const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`;
    window.open(intent, '_blank', 'noopener,noreferrer');
  };

  const iconActions = [
    { id: 'more' as const, label: 'More', Icon: MoreIcon, handler: handleMore },
    { id: 'link' as const, label: 'Workout Link', Icon: LinkIcon, handler: handleWorkoutLink },
    { id: 'copyText' as const, label: 'Copy Text', Icon: CopyTextIcon, handler: handleCopyText },
    { id: 'x' as const, label: 'X', Icon: XIcon, handler: handleX },
  ];

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
            <div className={styles.dragHandle} aria-hidden="true" />

            <div className={styles.sheetHeader}>
              <h2 className={styles.sheetTitle}>Share</h2>
              <button className={styles.closeBtn} onClick={onClose} type="button" aria-label="Close">
                <CloseIcon />
              </button>
            </div>

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
                      segment={segment}
                      label={segment !== 'full' ? segmentLabels[currentIndex] : undefined}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

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

            <button
              className={`${styles.primaryBtn} ${primaryDone ? styles.primaryBtnDone : ''}`}
              onClick={handleInstagram}
              disabled={isPrimaryBusy}
              type="button"
            >
              {primaryDone ? (
                <>
                  <CheckIcon />
                  <span>Opened Instagram</span>
                </>
              ) : (
                <>
                  <InstagramIcon />
                  <span>Instagram Stories</span>
                </>
              )}
            </button>

            <p className={styles.shareHint}>Share workout and tag @wodi</p>

            <div className={styles.iconRow}>
              {iconActions.map(({ id, label, Icon, handler }) => {
                const isSuccess =
                  (copyFeedback === 'text' && id === 'copyText') ||
                  (copyFeedback === 'link' && id === 'link');
                return (
                  <button key={id} className={styles.iconBtn} onClick={handler} type="button" aria-label={label}>
                    <div className={`${styles.iconBtnCircle} ${isSuccess ? styles.iconBtnCircleSuccess : ''}`}>
                      {isSuccess ? <CheckIcon /> : <Icon />}
                    </div>
                    <span className={styles.iconBtnLabel}>{isSuccess ? 'Copied' : label}</span>
                  </button>
                );
              })}
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
