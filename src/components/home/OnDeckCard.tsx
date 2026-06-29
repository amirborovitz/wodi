import type { PlannedWorkout, ParsedWorkout } from '../../types';
import styles from './OnDeckCard.module.css';

interface OnDeckCardProps {
  planned: PlannedWorkout;
  onLog: (planned: PlannedWorkout) => void;
}

const FORMAT_LABELS: Record<string, string> = {
  for_time: 'FOR TIME',
  amrap: 'AMRAP',
  amrap_intervals: 'AMRAP',
  intervals: 'INTERVALS',
  emom: 'EMOM',
  strength: 'STRENGTH',
  tabata: 'TABATA',
};

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getDayChip(date: Date): string {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const dateStr = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${tomorrow.getMonth()}-${tomorrow.getDate()}`;

  if (dateStr === todayStr) return 'TODAY';
  if (dateStr === tomorrowStr) return 'TOMORROW';
  return DAY_NAMES[date.getDay()];
}

function formatPlanDate(date: Date): string {
  return `${DAY_SHORT[date.getDay()]} · ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
}

function buildSubtitle(wod: ParsedWorkout): string {
  const parts: string[] = [];

  if (wod.timeCap && wod.timeCap > 0) {
    parts.push(`${Math.round(wod.timeCap / 60)}-MIN`);
  }

  const formatLabel = FORMAT_LABELS[wod.format ?? ''] ?? wod.format ?? '';
  if (formatLabel) parts.push(formatLabel);

  const ex0 = wod.exercises?.[0];
  if (ex0?.prescription && ex0.prescription.length < 40) {
    return ex0.prescription;
  }

  if (wod.benchmarkName) parts.push('· benchmark');

  return parts.join(' ');
}

interface MovementRow {
  label: string;
  isRx: boolean;
}

const MAX_MOVEMENTS = 4;

function getMovementRows(wod: ParsedWorkout): MovementRow[] {
  const ex0 = wod.exercises?.[0];
  if (!ex0) return [];

  if (ex0.movements && ex0.movements.length > 0) {
    return ex0.movements.map((m) => {
      const repPrefix = m.reps ? `${m.reps} ` : m.distance ? `${m.distance}m ` : m.calories ? `${m.calories}cal ` : '';
      const isRx = !!(m.rxWeights?.male || m.rxWeights?.female || m.rxCalories?.male);
      return { label: `${repPrefix}${m.name}`, isRx };
    });
  }

  // Strength: show sets from prescription or suggestedSets
  if (wod.format === 'strength' || ex0.type === 'strength') {
    const sets = ex0.suggestedSets ?? 3;
    const reps = ex0.suggestedReps ?? 5;
    return Array.from({ length: Math.min(sets, MAX_MOVEMENTS) }, (_, i) => ({
      label: i === sets - 1 && sets > 1
        ? `Top set · ${reps}`
        : `Set ${i + 1} · ${reps}`,
      isRx: false,
    }));
  }

  return [];
}

export function OnDeckCard({ planned, onLog }: OnDeckCardProps): React.JSX.Element {
  const { parsedWorkout, plannedDate } = planned;
  const dayChip = getDayChip(plannedDate);
  const formatLabel = FORMAT_LABELS[parsedWorkout.format ?? ''] ?? (parsedWorkout.format ?? '').toUpperCase();
  const subtitle = buildSubtitle(parsedWorkout);
  const allRows = getMovementRows(parsedWorkout);
  const visibleRows = allRows.slice(0, MAX_MOVEMENTS);
  const hiddenCount = allRows.length - visibleRows.length;

  return (
    <div className={styles.card}>
      <div className={styles.topBar}>
        <span className={styles.dayChip}>{dayChip}</span>
        {formatLabel && <span className={styles.formatTag}>{formatLabel}</span>}
      </div>

      <div className={styles.body}>
        <div className={styles.title}>{parsedWorkout.title ?? parsedWorkout.exercises?.[0]?.name ?? 'Workout'}</div>
        {subtitle && <div className={styles.subtitle}>{subtitle}</div>}

        {visibleRows.length > 0 && (
          <div className={styles.movements}>
            {visibleRows.map((row, i) => (
              <div key={i} className={styles.movRow}>
                <span className={styles.movName}>{row.label}</span>
                {row.isRx && <span className={styles.rxChip}>RX</span>}
              </div>
            ))}
            {hiddenCount > 0 && (
              <div className={styles.moreMovements}>+{hiddenCount} more</div>
            )}
          </div>
        )}
      </div>

      <hr className={styles.divider} />

      <div className={styles.footer}>
        <div className={styles.pendingRow}>
          <span className={styles.pendingLabel}>Result pending</span>
          <span className={styles.pendingDate}>{formatPlanDate(plannedDate)}</span>
        </div>
      </div>

      <button
        type="button"
        className={styles.ctaBtn}
        onClick={() => onLog(planned)}
      >
        Log result →
      </button>
    </div>
  );
}
