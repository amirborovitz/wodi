import type { WorkoutWithStats } from '../../hooks/useWorkouts';
import type { FeelRating, WorkoutFormat } from '../../types';
import { INTENSITY_DISPLAY } from '../../types';
import { VIBE } from '../celebration/faces/HandwrittenFace/brand';
import styles from './PosterThumbnail.module.css';

interface PosterThumbnailProps {
  workout: WorkoutWithStats;
  onClick: () => void;
  fullWidth?: boolean;
}

const VIBE_COLORS: Partial<Record<FeelRating, string>> = {
  cooked:     '#ef4444',
  smoked:     '#c566ff',
  barely:     '#8590a8',
  sent_it:    '#f5c200',
  gassed:     '#fb923c',
  held_on:    '#37d29b',
  machine:    '#37d29b',
  dark_place: '#c566ff',
  solid:      '#f5c200',
  easy_day:   '#37d29b',
  survived:   '#8590a8',
  dialed_in:  '#37d29b',
};

function getFormatTag(workout: WorkoutWithStats): string {
  const f = workout.format as WorkoutFormat | undefined;
  if (f === 'for_time') return 'FOR TIME';
  if (f === 'amrap' || f === 'amrap_intervals') return 'AMRAP';
  if (f === 'emom') return 'EMOM';
  if (f === 'strength') return 'STRENGTH';
  if (f === 'intervals') return 'INTERVALS';
  if (f === 'tabata') return 'TABATA';
  const t = workout.type;
  if (t === 'strength') return 'STRENGTH';
  if (t === 'amrap') return 'AMRAP';
  if (t === 'emom') return 'EMOM';
  return 'WOD';
}

function formatDuration(minutes: number): string {
  const totalSecs = Math.round(minutes * 60);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface HeroResult {
  value: string;
  label: string;
}

function getThumbnailHero(workout: WorkoutWithStats): HeroResult {
  const { format, exercises, duration, isPR, heroAchievement, achievements, type } = workout;

  // PR with a known weight
  const prAch = heroAchievement?.type === 'pr'
    ? heroAchievement
    : achievements?.find(a => a.type === 'pr');
  if (isPR && prAch?.value) {
    return { value: `${prAch.value}kg`, label: 'NEW 1RM' };
  }

  // Strength → max set weight
  if (format === 'strength' || type === 'strength') {
    let maxWeight = 0;
    for (const ex of exercises) {
      for (const set of ex.sets) {
        if (set.weight && set.weight > maxWeight) maxWeight = set.weight;
      }
    }
    if (maxWeight > 0) return { value: `${maxWeight}kg`, label: 'TOP SET' };
  }

  // AMRAP → round count
  if (format === 'amrap' || format === 'amrap_intervals') {
    const firstEx = exercises[0];
    if (firstEx?.rounds != null && firstEx.rounds > 0) {
      return { value: String(firstEx.rounds), label: firstEx.rounds === 1 ? 'ROUND' : 'ROUNDS' };
    }
    const completedSets = firstEx?.sets.filter(s => s.completed !== false).length ?? 0;
    if (completedSets > 0) return { value: String(completedSets), label: 'ROUNDS' };
  }

  // For time / intervals → duration
  if (duration) {
    if (format === 'for_time' || format === 'intervals') {
      return { value: formatDuration(duration), label: 'MY TIME' };
    }
    return { value: String(Math.round(duration)), label: 'MIN' };
  }

  return { value: '—', label: '' };
}

function getPrescriptionLine(workout: WorkoutWithStats): string | null {
  const { exercises, format } = workout;
  if (!exercises.length) return null;
  const p = exercises[0].prescription;
  if (p && p.length > 0 && p.length < 40) return p.toUpperCase();
  if (format === 'strength') return 'BUILD TO 1RM';
  return null;
}

interface MovRow { name: string; weight: string | null }

function getMovementRows(workout: WorkoutWithStats): MovRow[] {
  const breakdown = workout.workloadBreakdown?.movements;
  if (breakdown && breakdown.length > 0) {
    return breakdown.slice(0, 4).map(m => {
      const w = m.weightProgression?.length
        ? m.weightProgression[m.weightProgression.length - 1]
        : m.weight;
      return { name: m.name, weight: w ? `${w}kg` : null };
    });
  }
  const movements = workout.exercises[0]?.movements;
  if (movements && movements.length > 0) {
    return movements.slice(0, 4).map(m => ({ name: m.name, weight: null }));
  }
  return workout.exercises.slice(0, 4).map(ex => ({ name: ex.name, weight: null }));
}

function formatPosterDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
  const year = date.getFullYear().toString().slice(2);
  return `${day} ${month} ${year}`;
}

function getRelativeLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatPosterDate(date);
}

export function PosterThumbnail({ workout, onClick, fullWidth }: PosterThumbnailProps): React.ReactElement {
  const hero = getThumbnailHero(workout);
  const formatTag = getFormatTag(workout);
  const dateStr = formatPosterDate(workout.date);
  const prescription = getPrescriptionLine(workout);
  const movements = getMovementRows(workout);
  const relativeLabel = getRelativeLabel(workout.date);
  const posterVibe = workout.posterVibe;
  const feelVibe = workout.feelRating as FeelRating | undefined;
  const vibeLabel = posterVibe ? VIBE[posterVibe].label : (feelVibe ? INTENSITY_DISPLAY[feelVibe] : null);
  const vibeColor = posterVibe ? VIBE[posterVibe].color : (feelVibe ? (VIBE_COLORS[feelVibe] ?? '#f5c200') : '#f5c200');

  return (
    <div className={`${styles.wrapper} ${fullWidth ? styles.wrapperFull : ''}`}>
      <button
        type="button"
        className={`${styles.frame} ${fullWidth ? styles.frameFull : ''}`}
        onClick={onClick}
        aria-label={`Open ${workout.title} workout`}
      >
        {/* Header */}
        <div className={styles.posterHeader}>
          <span className={styles.formatTag}>{formatTag}</span>
          <span className={styles.dateStr}>{dateStr}</span>
        </div>

        {/* WOD name */}
        <h3 className={styles.wodName}>{workout.title}</h3>

        {/* Prescription */}
        {prescription && <p className={styles.prescription}>{prescription}</p>}

        <hr className={styles.divider} />

        {/* Movements */}
        <div className={styles.movements}>
          {movements.map((mov, i) => (
            <div key={i} className={styles.movementRow}>
              <span className={styles.movementName}>{mov.name}</span>
              {mov.weight && <span className={styles.movementWeight}>{mov.weight}</span>}
            </div>
          ))}
        </div>

        {/* Hero result */}
        <div className={styles.heroSection}>
          {hero.label && <span className={styles.heroLabel}>{hero.label}</span>}
          <span className={styles.heroValue}>{hero.value}</span>
        </div>

        {/* Vibe stamp */}
        {vibeLabel && (
          <div
            className={styles.vibeStamp}
            style={{ '--vibe-color': vibeColor } as React.CSSProperties}
          >
            <span className={styles.vibeFelt}>· FELT ·</span>
            <span className={styles.vibeWord}>{vibeLabel}</span>
          </div>
        )}

        {/* Footer */}
        <div className={styles.posterFooter}>
          {workout.isPR ? (
            <span className={styles.prBadge}>★ PR</span>
          ) : (
            <span />
          )}
          <span className={styles.wordmark}>
            wodi<span className={styles.wordmarkDot}>.</span>
          </span>
        </div>
      </button>

      {/* Label below the card */}
      <div className={styles.label}>
        {workout.isPR && <span className={styles.labelPR}>PR</span>}
        <span className={styles.labelDate}>{relativeLabel}</span>
      </div>
    </div>
  );
}
