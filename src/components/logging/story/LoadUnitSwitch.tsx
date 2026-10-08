import type { LoadUnit } from '../../../utils/loadUnits';
import type { LoadUnitSwitch as LoadUnitSwitchState } from './useLoadUnitSwitch';
import styles from './LoadUnitSwitch.module.css';

const UNITS: LoadUnit[] = ['kg', 'lb'];

/** KG · LB — which unit this page's weights are in. */
export function LoadUnitSwitch({ unit, onChange }: LoadUnitSwitchState) {
  return (
    <div className={styles.switch} role="radiogroup" aria-label="Weight unit">
      {UNITS.map((u) => (
        <button
          key={u}
          type="button"
          role="radio"
          aria-checked={u === unit}
          className={u === unit ? styles.active : styles.option}
          onClick={() => { if (u !== unit) onChange(u); }}
        >
          {u}
        </button>
      ))}
    </div>
  );
}
