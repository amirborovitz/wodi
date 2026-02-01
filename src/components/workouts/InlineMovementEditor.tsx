import type { FocusEvent } from 'react';
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

  // Determine what to show as the primary measurement (Column B)
  const showTimeInput = hasTime || (supportsTime && !hasDistance && !hasCalories);
  const showDistanceInput = hasDistance;
  const showCaloriesDisplay = hasCalories && !hasDistance && !hasTime;
  const showRepsInput = movement.reps !== undefined;

  // Determine what to show as secondary (Column C) - only for weighted movements
  const showWeightInput = isWeighted;
  const showRxDisplay = !isWeighted && movement.rxWeights;

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

  // Column 2: Primary Value (reps/sec/distance/calories) - VALUE ONLY, no unit
  const renderPrimaryValue = () => {
    if (readOnly) {
      if (showRepsInput && movement.reps) {
        return <span className={styles.staticValue}>{movement.reps}</span>;
      }
      if (showDistanceInput && movement.distance) {
        return <span className={styles.staticValue}>{movement.distance}</span>;
      }
      if (showTimeInput && movement.time) {
        return <span className={styles.staticValue}>{movement.time}</span>;
      }
      if (showCaloriesDisplay && movement.calories) {
        return <span className={styles.staticValue}>{movement.calories}</span>;
      }
      return null;
    }

    // Editable inputs - VALUE ONLY
    if (showRepsInput) {
      return (
        <input
          type="number"
          inputMode="numeric"
          enterKeyHint="next"
          className={styles.valueInput}
          value={displayReps ?? ''}
          onChange={(e) => onRepsChange?.(movement.name, parseInt(e.target.value) || 0)}
          onFocus={handleSelectOnFocus}
          min="0"
        />
      );
    }
    if (showDistanceInput) {
      return (
        <input
          type="number"
          inputMode="numeric"
          enterKeyHint="next"
          className={styles.valueInput}
          value={displayDistance || ''}
          onChange={(e) => onDistanceChange?.(movement.name, parseInt(e.target.value) || 0)}
          onFocus={handleSelectOnFocus}
          min="0"
        />
      );
    }
    if (showTimeInput) {
      return (
        <input
          type="number"
          inputMode="numeric"
          enterKeyHint="next"
          className={styles.valueInput}
          value={displayTime || ''}
          onChange={(e) => onTimeChange?.(movement.name, parseInt(e.target.value) || 0)}
          onFocus={handleSelectOnFocus}
          min="0"
          placeholder="0"
        />
      );
    }
    if (showCaloriesDisplay) {
      return <span className={styles.staticValue}>{movement.calories}</span>;
    }
    return null;
  };

  // Column 3: Unit OR Weight - Right-aligned
  // For weighted movements: weight input + kg
  // For non-weighted: unit label (s, reps, m, cal)
  const renderUnitOrWeight = () => {
    // Weighted movements get weight input in Column 3
    if (showWeightInput) {
      if (readOnly && movement.rxWeights) {
        const weightLabel = `${movement.rxWeights.female ?? movement.rxWeights.male}/${movement.rxWeights.male ?? movement.rxWeights.female}`;
        return <span className={styles.valueUnit}>{weightLabel}{movement.rxWeights.unit || 'kg'}</span>;
      }
      return (
        <>
          <input
            type="number"
            inputMode="decimal"
            enterKeyHint="next"
            className={styles.valueInput}
            value={customWeight || ''}
            onChange={(e) => onWeightChange?.(movement.name, parseFloat(e.target.value) || 0)}
            onFocus={handleSelectOnFocus}
            placeholder={movement.rxWeights?.male?.toString() || '0'}
            min="0"
          />
          <span className={styles.valueUnit}>kg</span>
        </>
      );
    }

    // Rx display without editable weight
    if (showRxDisplay && movement.rxWeights) {
      const weightLabel = `${movement.rxWeights.female || movement.rxWeights.male}/${movement.rxWeights.male}`;
      return <span className={styles.valueUnit}>{weightLabel}{movement.rxWeights.unit || 'kg'}</span>;
    }

    // Non-weighted: show unit label only
    if (showRepsInput) {
      return <span className={styles.valueUnit}>reps</span>;
    }
    if (showDistanceInput) {
      return <span className={styles.valueUnit}>{displayUnit}</span>;
    }
    if (showTimeInput) {
      return <span className={styles.valueUnit}>s</span>;
    }
    if (showCaloriesDisplay) {
      return <span className={styles.valueUnit}>cal</span>;
    }

    // Empty placeholder - keeps grid stable
    return <span className={styles.valueUnit}></span>;
  };

  return (
    <div className={styles.metricStrip}>
      {/* Column 1: Movement Name (1.2fr) - Left-aligned */}
      <div className={styles.colA}>
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
            <span className={styles.movementName}>{displayLabel}</span>
          </div>
        )}
      </div>

      {/* Column 2: Value (80px fixed) - Centered numeric input */}
      <div className={styles.colB}>
        {renderPrimaryValue()}
      </div>

      {/* Column 3: Unit/Weight (80px fixed) - Right-aligned */}
      <div className={styles.colC}>
        {renderUnitOrWeight()}
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
