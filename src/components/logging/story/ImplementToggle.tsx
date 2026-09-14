import styles from './ImplementToggle.module.css';

interface ImplementToggleProps {
  /** 1 or 2. Treated as 1 when the parse said nothing usable. */
  value: number | undefined;
  onChange: (count: 1 | 2) => void;
  /** Tile scale, for the version that sits under a movement's weight stepper. */
  dense?: boolean;
}

/**
 * "One in each hand, or one between them?" — the 1× / 2× choice for a hand-held implement.
 *
 * ONE control, wherever a dumbbell or kettlebell weight is entered. The strength screen has
 * always asked it; the metcon's movement tiles never did, so a board reading "19 Dumbbell /
 * Kettlebell Thruster" took the AI's `implementCount` verbatim and logged a two-dumbbell
 * thruster at half its real load, with no way for the athlete to say otherwise.
 *
 * The count cannot be read off the parse. Under v0.1.30's strict schema the model answers
 * `implementCount` on every movement, so a `1` means "asked and answered", not "the coach wrote
 * one" — it stamps 1 on runs and box jumps alike. The athlete is the only reliable source, which
 * is why this is a control and not an inference.
 */
export function ImplementToggle({ value, onChange, dense = false }: ImplementToggleProps) {
  return (
    <div className={`${styles.implementRow} ${dense ? styles.dense : ''}`}>
      <span className={styles.implementLabel}>Implements</span>
      <div className={styles.implementToggle}>
        {([1, 2] as const).map((count) => (
          <button
            key={count}
            type="button"
            className={`${styles.implementBtn} ${(value ?? 1) === count ? styles.implementBtnActive : ''}`}
            onClick={() => onChange(count)}
          >
            {count}x
          </button>
        ))}
      </div>
    </div>
  );
}
