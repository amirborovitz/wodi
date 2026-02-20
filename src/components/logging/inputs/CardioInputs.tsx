import type { FocusEvent } from 'react';
import styles from './inputs.module.css';

interface CardioCaloriesProps {
  mode: 'calories';
  cardioTurns: string;
  onTurnsChange: (value: string) => void;
  cardioCaloriesPerTurn: string;
  onCaloriesPerTurnChange: (value: string) => void;
  onFocus: (e: FocusEvent<HTMLInputElement>) => void;
}

interface CardioDistanceProps {
  mode: 'distance';
  cardioTurns: string;
  onTurnsChange: (value: string) => void;
  cardioDistancePerTurn: string;
  onDistancePerTurnChange: (value: string) => void;
  cardioDistanceUnit: 'm' | 'km' | 'mi';
  onDistanceUnitChange: (value: 'm' | 'km' | 'mi') => void;
  onFocus: (e: FocusEvent<HTMLInputElement>) => void;
}

type CardioInputsProps = CardioCaloriesProps | CardioDistanceProps;

export function CardioInputs(props: CardioInputsProps) {
  if (props.mode === 'calories') {
    const total = props.cardioTurns && props.cardioCaloriesPerTurn
      ? parseInt(props.cardioTurns) * parseInt(props.cardioCaloriesPerTurn)
      : null;

    return (
      <div className={styles.setsContainer}>
        <div className={styles.setRow}>
          <div className={styles.setInputs}>
            <div className={styles.inputGroup}>
              <label>Turns/Intervals</label>
              <input
                type="number"
                inputMode="numeric"
                enterKeyHint="next"
                value={props.cardioTurns}
                onChange={(e) => props.onTurnsChange(e.target.value)}
                onFocus={props.onFocus}
                placeholder="e.g. 3"
                className={styles.setInput}
                min="1"
              />
            </div>

            <div className={styles.inputGroup}>
              <label>Avg Calories per Turn</label>
              <input
                type="number"
                inputMode="numeric"
                enterKeyHint="next"
                value={props.cardioCaloriesPerTurn}
                onChange={(e) => props.onCaloriesPerTurnChange(e.target.value)}
                onFocus={props.onFocus}
                placeholder="e.g. 25"
                className={styles.setInput}
                min="0"
              />
            </div>
          </div>
        </div>

        {total !== null && (
          <div className={styles.totalDisplay}>
            <span className={styles.totalLabel}>Total Calories:</span>
            <span className={styles.totalValue}>{total}</span>
          </div>
        )}
      </div>
    );
  }

  // Distance mode
  const total = props.cardioTurns && props.cardioDistancePerTurn
    ? parseInt(props.cardioTurns) * parseInt(props.cardioDistancePerTurn)
    : null;

  return (
    <div className={styles.setsContainer}>
      <div className={styles.setRow}>
        <div className={styles.setInputs}>
          <div className={styles.inputGroup}>
            <label>Turns/Intervals</label>
            <input
              type="number"
              inputMode="numeric"
              enterKeyHint="next"
              value={props.cardioTurns}
              onChange={(e) => props.onTurnsChange(e.target.value)}
              onFocus={props.onFocus}
              placeholder="e.g. 3"
              className={styles.setInput}
              min="1"
            />
          </div>

          <div className={styles.inputGroup}>
            <label>Distance per Turn</label>
            <div className={styles.distanceInputWrapper}>
              <input
                type="number"
                inputMode="numeric"
                enterKeyHint="next"
                value={props.cardioDistancePerTurn}
                onChange={(e) => props.onDistancePerTurnChange(e.target.value)}
                onFocus={props.onFocus}
                placeholder="e.g. 400"
                className={styles.setInput}
                min="0"
              />
              <select
                value={props.cardioDistanceUnit}
                onChange={(e) => props.onDistanceUnitChange(e.target.value as 'm' | 'km' | 'mi')}
                className={styles.unitSelect}
              >
                <option value="m">m</option>
                <option value="km">km</option>
                <option value="mi">mi</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {total !== null && (
        <div className={styles.totalDisplay}>
          <span className={styles.totalLabel}>Total Distance:</span>
          <span className={styles.totalValue}>
            {total} {props.cardioDistanceUnit}
          </span>
        </div>
      )}
    </div>
  );
}
