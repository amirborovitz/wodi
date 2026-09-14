import type { Milestone } from '../../hooks/useMilestone';
import styles from './MilestoneLine.module.css';

interface MilestoneLineProps {
  milestone: Milestone;
}

function plural(movement: string, unit: Milestone['unit']): string {
  if (unit === 'km') return movement.toLowerCase();
  const lower = movement.toLowerCase();
  if (lower.endsWith('s')) return lower;
  // "Toes to Bar", "Shoulder to Overhead", "Handstand Walk" — a trailing plural
  // reads wrong on these. The registry spells its families out with spaces, so
  // matching only the hyphenated form left "toes to bars" on the screen.
  if (/(^|[\s-])to[\s-]/.test(lower) || lower.endsWith('walk') || lower.endsWith('hold')) return lower;
  return `${lower}s`;
}

function format(value: number, unit: Milestone['unit']): string {
  return unit === 'km'
    ? `${Math.round(value).toLocaleString()} km`
    : Math.round(value).toLocaleString();
}

/**
 * "4,382 pull-ups · 618 to 5,000"
 *
 * A journey marker with no clock on it. It cannot show a deficit, because there
 * is no deadline to miss — cross a number and the next one quietly appears.
 *
 * Three states, in order of how much they are worth saying:
 *  - just crossed one: an event, and the best thing this line ever says
 *  - approaching one:  the count, and how much is left
 *  - nothing near:     the count alone, with no target invented to fill the gap
 */
export function MilestoneLine({ milestone }: MilestoneLineProps): React.ReactElement {
  const { movement, unit, total, next, remaining, justCrossed } = milestone;
  const name = plural(movement, unit);

  if (justCrossed !== null) {
    return (
      <p className={styles.line}>
        <span className={styles.crossed}>PASSED</span>
        <span className={styles.value}>{format(justCrossed, unit)}</span>
        <span className={styles.unit}>{name}</span>
      </p>
    );
  }

  return (
    <p className={styles.line}>
      <span className={styles.value}>{format(total, unit)}</span>
      <span className={styles.unit}>{name}</span>
      {remaining !== null && next !== null && (
        <span className={styles.next}>
          {format(remaining, unit)} to {next.toLocaleString()}
        </span>
      )}
    </p>
  );
}
