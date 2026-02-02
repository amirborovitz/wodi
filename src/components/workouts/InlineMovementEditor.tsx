import type { FocusEvent, ReactNode } from 'react';
import type { ParsedMovement } from '../../types';
import { getExerciseAlternatives, findExerciseDefinition } from '../../data/exerciseDefinitions';
import styles from './InlineMovementEditor.module.css';

interface MovementEditorProps {
  movement: ParsedMovement;
  // Current values
  selectedAlternative?: string;
  customDistance?: number;
  customTime?: number;
  customWeight?: number;
  customReps?: number;
  // Callbacks
  onAlternativeChange?: (originalName: string, alternativeName: string | null, newDistance?: number) => void;
  onDistanceChange?: (movementName: string, distance: number) => void;
  onTimeChange?: (movementName: string, time: number) => void;
  onWeightChange?: (movementName: string, weight: number) => void;
  onRepsChange?: (movementName: string, reps: number) => void;
  // Display options
  showWeight?: boolean;
  readOnly?: boolean;
}

// Check if a movement requires weight input
function isWeightedMovement(movement: ParsedMovement): boolean {
  if (movement.rxWeights) return true;

  const name = movement.name.toLowerCase();
  const weightedPatterns = [
    'deadlift', 'clean', 'jerk', 'snatch', 'squat', 'press', 'thruster',
    'lunge', 'row', 'swing', 'turkish', 'farmer', 'carry', 'curl',
    'bench', 'overhead', 'front rack', 'back rack', 'goblet',
  ];

  // Exclude cardio "row" - only barbell/dumbbell movements
  if (name.includes('row') && (name.includes('ring') || name.includes('rower') || name.includes('erg'))) {
    return false;
  }

  return weightedPatterns.some(pattern => name.includes(pattern));
}

function abbreviateMovementLabel(name: string): string {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  const exactMap: Record<string, string> = {
    'russian kettlebell swing': 'KB Swings',
    'russian kettlebell swings': 'KB Swings',
    'kettlebell swing': 'KB Swings',
    'kettlebell swings': 'KB Swings',
    'american kettlebell swing': 'KB Swings',
    'american kettlebell swings': 'KB Swings',
    'v-up': 'V-ups',
    'v up': 'V-ups',
    'v-ups': 'V-ups',
  };

  if (exactMap[lower]) return exactMap[lower];
  return trimmed;
}

export function InlineMovementEditor({
  movement,
  selectedAlternative,
  customDistance,
  customTime,
  customWeight,
  customReps,
  onAlternativeChange,
  onDistanceChange,
  onTimeChange,
  onWeightChange,
  onRepsChange,
  showWeight,
  readOnly = false,
}: MovementEditorProps) {
  const alternatives = getExerciseAlternatives(movement.name);
  const hasAlternatives = alternatives.length > 0;
  const isWeighted = showWeight || isWeightedMovement(movement);
  const hasDistance = movement.distance !== undefined && movement.distance > 0;
  const hasTime = movement.time !== undefined && movement.time > 0;
  const hasCalories = movement.calories !== undefined && movement.calories > 0;
  const hasReps = movement.reps !== undefined && movement.reps > 0;

  // Check what the exercise supports
  const exerciseDef = findExerciseDefinition(movement.name);
  const supportsTime = exerciseDef?.supportsUnits?.includes('time') || hasTime;

  // Display name (either selected alternative or original)
  const displayName = selectedAlternative || movement.name;
  const displayLabel = abbreviateMovementLabel(displayName);

  // Display values (custom or original)
  const displayDistance = customDistance ?? movement.distance;
  const displayTime = customTime ?? movement.time;
  const displayReps = customReps ?? movement.reps;
  const displayUnit = movement.unit || 'm';

  // Determine what metrics to show
  const showTimeInput = hasTime || (supportsTime && !hasDistance && !hasCalories);
  const showDistanceInput = hasDistance;
  const showCaloriesDisplay = hasCalories && !hasDistance && !hasTime;
  const showRepsInput = hasReps;
  const showWeightInput = isWeighted;

  // Select all text on focus for easy overwriting
  const handleSelectOnFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.currentTarget.select();
  };

  const handleAlternativeSelect = (value: string) => {
    if (!onAlternativeChange) return;

    if (value === '' || value === movement.name) {
      onAlternativeChange(movement.name, null, movement.distance);
    } else {
      const alt = alternatives.find(a => a.name === value);
      const newDistance = alt?.distanceMultiplier && movement.distance
        ? Math.round(movement.distance * alt.distanceMultiplier)
        : movement.distance;
      onAlternativeChange(movement.name, value, newDistance);
    }
  };

  // Build metric pills array
  const renderMetricPills = () => {
    const pills: ReactNode[] = [];

    // Reps pill
    if (showRepsInput) {
      if (readOnly) {
        pills.push(
          <div key="reps" className={styles.metricPill}>
            <span className={styles.pillValue}>{movement.reps}</span>
            <span className={styles.pillUnit}>reps</span>
          </div>
        );
      } else {
        pills.push(
          <div key="reps" className={`${styles.metricPill} ${styles.editable}`}>
            <span className={styles.pillUnit}>reps</span>
            <input
              type="number"
              inputMode="numeric"
              enterKeyHint="next"
              className={styles.pillInput}
              value={displayReps ?? ''}
              onChange={(e) => onRepsChange?.(movement.name, parseInt(e.target.value) || 0)}
              onFocus={handleSelectOnFocus}
              min="0"
            />
          </div>
        );
      }
    }

    // Distance pill
    if (showDistanceInput) {
      if (readOnly) {
        pills.push(
          <div key="distance" className={styles.metricPill}>
            <span className={styles.pillValue}>{movement.distance}</span>
            <span className={styles.pillUnit}>{displayUnit}</span>
          </div>
        );
      } else {
        pills.push(
          <div key="distance" className={`${styles.metricPill} ${styles.editable}`}>
            <span className={styles.pillUnit}>{displayUnit}</span>
            <input
              type="number"
              inputMode="numeric"
              enterKeyHint="next"
              className={styles.pillInput}
              value={displayDistance || ''}
              onChange={(e) => onDistanceChange?.(movement.name, parseInt(e.target.value) || 0)}
              onFocus={handleSelectOnFocus}
              min="0"
            />
          </div>
        );
      }
    }

    // Time pill
    if (showTimeInput) {
      if (readOnly) {
        pills.push(
          <div key="time" className={styles.metricPill}>
            <span className={styles.pillValue}>{movement.time}</span>
            <span className={styles.pillUnit}>sec</span>
          </div>
        );
      } else {
        pills.push(
          <div key="time" className={`${styles.metricPill} ${styles.editable}`}>
            <span className={styles.pillUnit}>sec</span>
            <input
              type="number"
              inputMode="numeric"
              enterKeyHint="next"
              className={styles.pillInput}
              value={displayTime || ''}
              onChange={(e) => onTimeChange?.(movement.name, parseInt(e.target.value) || 0)}
              onFocus={handleSelectOnFocus}
              placeholder="0"
              min="0"
            />
          </div>
        );
      }
    }

    // Calories pill (always read-only display)
    if (showCaloriesDisplay) {
      pills.push(
        <div key="calories" className={styles.metricPill}>
          <span className={`${styles.pillValue} ${styles.accent}`}>{movement.calories}</span>
          <span className={`${styles.pillUnit} ${styles.accent}`}>cal</span>
        </div>
      );
    }

    // Weight pill
    if (showWeightInput) {
      if (readOnly && movement.rxWeights) {
        const weightLabel = `${movement.rxWeights.female ?? movement.rxWeights.male}/${movement.rxWeights.male ?? movement.rxWeights.female}`;
        pills.push(
          <div key="weight" className={styles.metricPill}>
            <span className={styles.pillValue}>{weightLabel}</span>
            <span className={styles.pillUnit}>{movement.rxWeights.unit || 'kg'}</span>
          </div>
        );
      } else {
        pills.push(
          <div key="weight" className={`${styles.metricPill} ${styles.editable}`}>
            <input
              type="number"
              inputMode="decimal"
              enterKeyHint="next"
              className={`${styles.pillInput} ${styles.wide}`}
              value={customWeight || ''}
              onChange={(e) => onWeightChange?.(movement.name, parseFloat(e.target.value) || 0)}
              onFocus={handleSelectOnFocus}
              placeholder={movement.rxWeights?.male?.toString() || '0'}
              min="0"
            />
            <span className={styles.pillUnit}>kg</span>
          </div>
        );

        // Add Rx badge if there's a prescription
        if (movement.rxWeights) {
          const rxLabel = `Rx: ${movement.rxWeights.female || '?'}/${movement.rxWeights.male}`;
          pills.push(
            <span key="rx" className={styles.rxBadge}>{rxLabel}</span>
          );
        }
      }
    }

    return pills;
  };

  return (
    <div className={styles.movementCard}>
      {/* Movement Header - Name on top */}
      <div className={styles.movementHeader}>
        {hasAlternatives ? (
          <select
            className={styles.movementSelect}
            value={selectedAlternative || movement.name}
            onChange={(e) => handleAlternativeSelect(e.target.value)}
            disabled={readOnly}
          >
            <option value={movement.name}>{abbreviateMovementLabel(movement.name)}</option>
            {alternatives.map((alt) => (
              <option key={alt.name} value={alt.name}>
                {abbreviateMovementLabel(alt.name)}
                {alt.type === 'easier' ? ' (scaled)' : alt.type === 'harder' ? ' (Rx+)' : ''}
              </option>
            ))}
          </select>
        ) : (
          <div className={styles.movementStaticLabel}>
            <span className={`${styles.movementName} ${isWeighted ? styles.weighted : ''}`}>
              {displayLabel}
            </span>
          </div>
        )}
      </div>

      {/* Metric Cluster - Pills below, indented */}
      <div className={styles.metricCluster}>
        {renderMetricPills()}
      </div>
    </div>
  );
}

interface MovementListEditorProps {
  movements: ParsedMovement[];
  selectedAlternatives: Record<string, string>;
  customDistances: Record<string, number>;
  customTimes: Record<string, number>;
  customWeights: Record<string, number>;
  customReps: Record<string, number>;
  onAlternativeChange: (originalName: string, alternativeName: string | null, newDistance?: number) => void;
  onDistanceChange: (movementName: string, distance: number) => void;
  onTimeChange: (movementName: string, time: number) => void;
  onWeightChange: (movementName: string, weight: number) => void;
  onRepsChange: (movementName: string, reps: number) => void;
  readOnly?: boolean;
}

export function MovementListEditor({
  movements,
  selectedAlternatives,
  customDistances,
  customTimes,
  customWeights,
  customReps,
  onAlternativeChange,
  onDistanceChange,
  onTimeChange,
  onWeightChange,
  onRepsChange,
  readOnly = false,
}: MovementListEditorProps) {
  return (
    <div className={styles.movementList}>
      {movements.map((movement, index) => (
        <InlineMovementEditor
          key={`${movement.name}-${index}`}
          movement={movement}
          selectedAlternative={selectedAlternatives[movement.name]}
          customDistance={customDistances[movement.name]}
          customTime={customTimes[movement.name]}
          customWeight={customWeights[movement.name]}
          customReps={customReps[movement.name]}
          onAlternativeChange={onAlternativeChange}
          onDistanceChange={onDistanceChange}
          onTimeChange={onTimeChange}
          onWeightChange={onWeightChange}
          onRepsChange={onRepsChange}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}
