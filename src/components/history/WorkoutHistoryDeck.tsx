import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, animate as fmAnimate, useMotionValue } from 'framer-motion';
import type { WorkoutType } from '../../types';
import type { WorkoutWithStats } from '../../hooks/useWorkouts';
import { calculateWorkoutEP, getTimeCapMinutes, DEFAULT_BW } from '../../utils/xpCalculations';
import { useAuth } from '../../context/AuthContext';
import celebrationStyles from '../../screens/WorkoutScreen.module.css';

interface WorkoutHistoryDeckProps {
  workouts: WorkoutWithStats[];
  onSelectWorkout?: (id: string) => void;
  onDeleteWorkout?: (id: string) => void;
  onEditWorkout?: (id: string) => void;
}

const GENERIC_TITLES = /^(workout|practice|training|session|untitled|wod|cycle\s*\d*|week\s*\d*|day\s*\d*)$/i;

const typeLabels: Record<WorkoutType, string> = {
  for_time: 'For Time',
  amrap: 'AMRAP',
  emom: 'EMOM',
  strength: 'Strength',
  metcon: 'MetCon',
  mixed: 'Mixed',
};

const metricAccentClasses = [
  celebrationStyles.celebMetricNumYellow,
  celebrationStyles.celebMetricNumMagenta,
  celebrationStyles.celebMetricNumCyan,
];

const cardGlowClasses = [
  celebrationStyles.celebCardGlowYellow,
  celebrationStyles.celebCardGlowMagenta,
  celebrationStyles.celebCardGlowCyan,
];

const heroBadgeClasses = [
  celebrationStyles.celebHeroBadgeYellow,
  celebrationStyles.celebHeroBadgeMagenta,
  celebrationStyles.celebHeroBadgeCyan,
];

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getSmartTitle(workout: WorkoutWithStats): string {
  const raw = workout.title?.trim();
  if (raw && !GENERIC_TITLES.test(raw)) return raw;

  const movements = workout.workloadBreakdown?.movements;
  if (movements && movements.length > 0) {
    const names = movements.map((movement) => movement.name);
    if (names.length === 1) return names[0];
    return `${names[0]} & ${names[1]}`;
  }

  if (workout.exercises?.length > 0) {
    const names = workout.exercises.map((exercise) => exercise.name).filter(Boolean);
    if (names.length === 1) return names[0];
    if (names.length >= 2) return `${names[0]} & ${names[1]}`;
  }

  return 'Workout';
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatVolume(kg: number): { value: string; unit: string } {
  if (kg >= 1000) return { value: (kg / 1000).toFixed(2), unit: 'tons' };
  return { value: `${Math.round(kg)}`, unit: 'kg' };
}

function formatDistance(meters: number): { value: string; unit: string } {
  if (meters >= 1000) return { value: (meters / 1000).toFixed(1), unit: 'km' };
  return { value: `${Math.round(meters)}`, unit: 'm' };
}

function formatDuration(minutes: number): { value: string; unit: string } {
  if (minutes <= 0) return { value: '0', unit: 'min' };
  if (minutes < 60) return { value: `${minutes}`, unit: 'min' };
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? { value: `${hrs}:${mins.toString().padStart(2, '0')}`, unit: 'hr' } : { value: `${hrs}`, unit: 'hr' };
}

function truncateDescription(text: string): string {
  if (text.length <= 120) return text;
  return `${text.slice(0, 117)}...`;
}

export function WorkoutHistoryDeck({
  workouts,
  onSelectWorkout,
  onDeleteWorkout,
  onEditWorkout,
}: WorkoutHistoryDeckProps) {
  const { user } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const viewportWidthRef = useRef(0);
  const dragRef = useRef<{ touchX: number; motionX: number; time: number } | null>(null);
  const slideX = useMotionValue(0);

  const bodyweight = user?.weight || DEFAULT_BW;

  const cards = useMemo(() => workouts.map((workout, index) => {
    const timeCapMinutes = getTimeCapMinutes(workout);
    const ep = calculateWorkoutEP(workout.totalVolume, timeCapMinutes, bodyweight, workout.isPR, workout.workloadBreakdown?.movements);
    const totalDistance = workout.workloadBreakdown?.grandTotalDistance || 0;
    const totalCalories = workout.workloadBreakdown?.grandTotalCalories || 0;
    const duration = workout.duration || 0;
    const volume = formatVolume(workout.totalVolume);
    const distance = formatDistance(totalDistance);
    const durationDisplay = formatDuration(duration);
    const title = getSmartTitle(workout).toUpperCase();
    const descriptionSource = workout.rawText?.trim()
      || workout.workloadBreakdown?.movements?.slice(0, 4).map((movement) => movement.name).join(' • ')
      || workout.exercises.map((exercise) => exercise.name).filter(Boolean).slice(0, 4).join(' • ');

    const metrics = [
      { label: 'Effort', value: `${ep.total}`, unit: 'EP', subLabel: workout.isPR ? 'Includes PR bonus' : typeLabels[workout.type], accentClass: metricAccentClasses[index % metricAccentClasses.length] },
      { label: 'Reps', value: `${workout.totalReps.toLocaleString()}`, unit: '', subLabel: `${workout.exercises.length} exercise${workout.exercises.length === 1 ? '' : 's'}`, accentClass: metricAccentClasses[(index + 1) % metricAccentClasses.length] },
      workout.totalVolume > 0
        ? { label: 'Lifted', value: volume.value, unit: volume.unit, subLabel: 'Total volume', accentClass: metricAccentClasses[(index + 2) % metricAccentClasses.length] }
        : totalDistance > 0
          ? { label: 'Distance', value: distance.value, unit: distance.unit, subLabel: totalCalories > 0 ? `${totalCalories} calories` : 'Total distance', accentClass: metricAccentClasses[(index + 2) % metricAccentClasses.length] }
          : { label: 'Duration', value: durationDisplay.value, unit: durationDisplay.unit, subLabel: 'Logged time', accentClass: metricAccentClasses[(index + 2) % metricAccentClasses.length] },
    ];

    return {
      workout,
      title,
      description: truncateDescription(descriptionSource || 'Completed workout'),
      dateLabel: formatDate(workout.date),
      heroLabel: workout.isPR ? 'New PR' : 'Workout',
      heroValue: workout.isPR ? 'PR' : `${ep.total}`,
      heroSubValue: workout.isPR ? typeLabels[workout.type] : 'EP',
      metrics,
      durationDisplay,
      glowClass: cardGlowClasses[index % cardGlowClasses.length],
      heroBadgeClass: heroBadgeClasses[index % heroBadgeClasses.length],
    };
  }), [workouts, bodyweight]);

  useEffect(() => {
    const syncWidth = () => {
      const nextWidth = viewportRef.current?.offsetWidth || 0;
      viewportWidthRef.current = nextWidth;
      slideX.set(-currentIndex * nextWidth);
    };

    syncWidth();
    window.addEventListener('resize', syncWidth);
    return () => window.removeEventListener('resize', syncWidth);
  }, [currentIndex, slideX]);

  useEffect(() => {
    if (currentIndex > cards.length - 1) {
      setCurrentIndex(Math.max(cards.length - 1, 0));
    }
  }, [cards.length, currentIndex]);

  const goTo = (index: number) => {
    const clamped = Math.max(0, Math.min(cards.length - 1, index));
    setCurrentIndex(clamped);
    fmAnimate(slideX, -clamped * viewportWidthRef.current, {
      type: 'spring',
      stiffness: 380,
      damping: 36,
    });
  };

  const activeCard = cards[currentIndex];

  return (
    <div className={celebrationStyles.celebContainer}>
      <div className={celebrationStyles.celebNavBar}>
        <button
          className={celebrationStyles.celebNavBtn}
          onClick={() => goTo(currentIndex - 1)}
          disabled={currentIndex === 0}
          aria-label="Previous workout"
        >
          <BackIcon />
        </button>

        <div className={celebrationStyles.celebNavTitle}>
          <div className={celebrationStyles.celebNavDay}>{activeCard?.dateLabel || 'History'}</div>
          <div className={celebrationStyles.celebNavSub}>
            {cards.length > 0 ? `${currentIndex + 1} of ${cards.length}` : 'No workouts'}
          </div>
        </div>

        <button
          className={celebrationStyles.celebNavBtn}
          onClick={() => goTo(currentIndex + 1)}
          disabled={currentIndex === cards.length - 1}
          aria-label="Next workout"
        >
          <ForwardIcon />
        </button>
      </div>

      <div className={celebrationStyles.celebDots}>
        {cards.map((card, index) => (
          <button
            key={card.workout.id}
            className={`${celebrationStyles.celebDot} ${index === currentIndex ? celebrationStyles.celebDotActive : ''}`}
            onClick={() => goTo(index)}
            aria-label={`Workout ${index + 1}`}
          />
        ))}
      </div>

      <div
        ref={viewportRef}
        className={celebrationStyles.celebTrack}
        onTouchStart={(event) => {
          dragRef.current = {
            touchX: event.touches[0].clientX,
            motionX: slideX.get(),
            time: Date.now(),
          };
        }}
        onTouchMove={(event) => {
          if (!dragRef.current) return;
          const width = viewportWidthRef.current || viewportRef.current?.offsetWidth || 390;
          const dx = event.touches[0].clientX - dragRef.current.touchX;
          const raw = dragRef.current.motionX + dx;
          const minX = -(cards.length - 1) * width;
          const maxX = 0;
          const clamped = Math.max(minX, Math.min(maxX, raw));
          const overshoot = raw - clamped;
          slideX.set(clamped + overshoot * 0.12);
        }}
        onTouchEnd={(event) => {
          if (!dragRef.current) return;
          const width = viewportWidthRef.current || viewportRef.current?.offsetWidth || 390;
          const dx = event.changedTouches[0].clientX - dragRef.current.touchX;
          const dt = Math.max(1, Date.now() - dragRef.current.time);
          const velocity = dx / dt * 1000;
          dragRef.current = null;

          let nextIndex = currentIndex;
          if ((dx < -width * 0.2 || velocity < -400) && currentIndex < cards.length - 1) nextIndex = currentIndex + 1;
          if ((dx > width * 0.2 || velocity > 400) && currentIndex > 0) nextIndex = currentIndex - 1;
          goTo(nextIndex);
        }}
      >
        <motion.div
          className={celebrationStyles.celebSlidesWrap}
          style={{ x: slideX, width: `${cards.length * 100}%` }}
        >
          {cards.map((card) => (
            <div key={card.workout.id} className={celebrationStyles.celebSlide} style={{ width: `${100 / cards.length}%` }}>
              <div className={`${celebrationStyles.celebCard} ${card.glowClass}`}>
                <div className={celebrationStyles.celebCardTop}>
                  <span className={celebrationStyles.celebPartTag}>{card.workout.isPR ? 'PR Logged' : typeLabels[card.workout.type]}</span>
                  <span className={celebrationStyles.celebWodDate}>{card.dateLabel}</span>
                </div>

                <div className={celebrationStyles.celebWodName}>{card.title}</div>

                <div className={`${celebrationStyles.celebHeroBadge} ${card.heroBadgeClass}`}>
                  <span className={celebrationStyles.celebBadgeLabel}>{card.heroLabel}</span>
                  <span className={celebrationStyles.celebBadgeMain}>{card.heroValue}</span>
                  <span className={celebrationStyles.celebBadgeSub}>{card.heroSubValue}</span>
                </div>

                <div className={celebrationStyles.celebDescLabel}>Workout Snapshot</div>
                <div className={celebrationStyles.celebDescription}>{card.description}</div>

                <div className={celebrationStyles.celebMetrics}>
                  {card.metrics.map((metric) => (
                    <div key={metric.label}>
                      <div className={celebrationStyles.celebMetricRow}>
                        <span className={`${celebrationStyles.celebMetricNum} ${metric.accentClass}`}>{metric.value}</span>
                        {metric.unit && <span className={celebrationStyles.celebMetricUnit}>{metric.unit}</span>}
                        <span className={celebrationStyles.celebMetricLabel}>{metric.label}</span>
                      </div>
                      <div className={celebrationStyles.celebMetricSub}>{metric.subLabel}</div>
                    </div>
                  ))}
                </div>

                <div className={celebrationStyles.celebDivider} />

                <div className={celebrationStyles.celebBottomStats}>
                  <div>
                    <div className={celebrationStyles.celebStatLabel}>Duration</div>
                    <div className={celebrationStyles.celebStatValue}>
                      {card.durationDisplay.value}
                      {card.durationDisplay.unit && <span className={celebrationStyles.celebStatUnit}>{card.durationDisplay.unit}</span>}
                    </div>
                  </div>
                  <div>
                    <div className={celebrationStyles.celebStatLabel}>Exercises</div>
                    <div className={celebrationStyles.celebStatValue}>{card.workout.exercises.length}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </motion.div>
      </div>

      {activeCard && (
        <div className={celebrationStyles.celebBottomActions}>
          <button
            className={celebrationStyles.celebShareBtn}
            onClick={() => onSelectWorkout?.(activeCard.workout.id)}
          >
            Open Workout
          </button>
          <div className={celebrationStyles.celebActionRow}>
            <button
              className={celebrationStyles.celebActionBtn}
              onClick={() => onEditWorkout?.(activeCard.workout.id)}
            >
              Edit
            </button>
            <button
              className={`${celebrationStyles.celebActionBtn} ${celebrationStyles.celebActionBtnDone}`}
              onClick={() => onDeleteWorkout?.(activeCard.workout.id)}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
