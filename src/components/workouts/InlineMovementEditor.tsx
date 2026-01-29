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
  // Callbacks
  onAlternativeChange?: (originalName: string, alternativeName: string | null, newDistance?: number) => void;
  onDistanceChange?: (movementName: string, distance: number) => void;
  onTimeChange?: (movementName: string, time: number) => void;
  onWeightChange?: (movementName: string, weight: number) => void;
  // Display options
  showWeight?: boolean;  // Force show weight input
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

export function InlineMovementEditor({
  movement,
  selectedAlternative,
  customDistance,
  customTime,
  customWeight,
  onAlternativeChange,
  onDistanceChange,
  onTimeChange,
  onWeightChange,
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

  // Display values (custom or original)
  const displayDistance = customDistance ?? movement.distance;
  const displayTime = customTime ?? movement.time;
  const displayUnit = movement.unit || 'm';

  // Determine what to show as the primary measurement
  const showTimeInput = hasTime || (supportsTime && !hasDistance && !hasCalories);
  const showDistanceInput = hasDistance;
  const showCaloriesDisplay = hasCalories && !hasDistance && !hasTime;

  // For simple movements with no editability
  const isSimpleMovement = !hasAlternatives && !isWeighted && !hasDistance && !hasTime && !hasCalories;

  if (readOnly || isSimpleMovement) {
    const stats: Array<{ value: string; unit: string }> = [];
    if (movement.reps) stats.push({ value: movement.reps.toString(), unit: 'reps' });
    if (hasDistance && movement.distance) stats.push({ value: movement.distance.toString(), unit: displayUnit });
    if (hasCalories && movement.calories) stats.push({ value: movement.calories.toString(), unit: 'cal' });
    if (hasTime && movement.time) stats.push({ value: movement.time.toString(), unit: 'sec' });
    if (movement.rxWeights) {
      const weightLabel = `${movement.rxWeights.female ?? movement.rxWeights.male}/${movement.rxWeights.male ?? movement.rxWeights.female}`;
      stats.push({ value: weightLabel, unit: movement.rxWeights.unit || 'kg' });
    }

    return (
      <div className={styles.movementRow}>
        <div className={styles.movementLabel}>
          <span className={styles.movementName}>{displayName}</span>
        </div>
        <div className={styles.movementControls}>
          {stats.map((stat, index) => (
            <span key={`${stat.value}-${index}`} className={styles.movementStat}>
              <span className={styles.movementValue}>{stat.value}</span>
              <span className={styles.movementUnit}>{stat.unit}</span>
            </span>
          ))}
          {!stats.length && (
            <span className={styles.movementStat}>
              <span className={styles.movementValue}>-</span>
              <span className={styles.movementUnit}>-</span>
            </span>
          )}
        </div>
      </div>
    );
  }

  const handleAlternativeSelect = (value: string) => {
    if (!onAlternativeChange) return;

    if (value === '' || value === movement.name) {
      // Reset to original
      onAlternativeChange(movement.name, null, movement.distance);
    } else {
      // Find the alternative and calculate new distance
      const alt = alternatives.find(a => a.name === value);
      const newDistance = alt?.distanceMultiplier && movement.distance
        ? Math.round(movement.distance * alt.distanceMultiplier)
        : movement.distance;
      onAlternativeChange(movement.name, value, newDistance);
    }
  };

  return (
    <div className={styles.movementRow}>
      <div className={styles.movementLabel}>
        {hasAlternatives ? (
          <select
            className={styles.movementSelect}
            value={selectedAlternative || movement.name}
            onChange={(e) => handleAlternativeSelect(e.target.value)}
          >
            <option value={movement.name}>{movement.name}</option>
            {alternatives.map((alt) => (
              <option key={alt.name} value={alt.name}>
                {alt.name}
                {alt.type === 'easier' ? ' (scaled)' : alt.type === 'harder' ? ' (Rx+)' : ''}
              </option>
            ))}
          </select>
        ) : (
          <span className={styles.movementName}>{displayName}</span>
        )}
      </div>

      <div className={styles.movementControls}>
        {movement.reps && (
          <span className={styles.movementStat}>
            <span className={styles.movementValue}>{movement.reps}</span>
            <span className={styles.movementUnit}>reps</span>
          </span>
        )}
        {showTimeInput && (
          <span className={styles.movementStat}>
            <input
              type="number"
              inputMode="numeric"
              className={styles.valueInput}
              value={displayTime || ''}
              onChange={(e) => onTimeChange?.(movement.name, parseInt(e.target.value) || 0)}
              min="0"
              placeholder="sec"
            />
            <span className={styles.movementUnit}>s</span>
          </span>
        )}
        {showDistanceInput && (
          <span className={styles.movementStat}>
            <input
              type="number"
              inputMode="numeric"
              className={styles.valueInput}
              value={displayDistance || ''}
              onChange={(e) => onDistanceChange?.(movement.name, parseInt(e.target.value) || 0)}
              min="0"
            />
            <span className={styles.movementUnit}>{displayUnit}</span>
          </span>
        )}
        {showCaloriesDisplay && (
          <span className={styles.movementStat}>
            <span className={styles.movementValue}>{movement.calories}</span>
            <span className={styles.movementUnit}>cal</span>
          </span>
        )}
        {isWeighted && (
          <span className={styles.movementStat}>
            <input
              type="number"
              inputMode="decimal"
              className={styles.valueInput}
              value={customWeight || ''}
              onChange={(e) => onWeightChange?.(movement.name, parseFloat(e.target.value) || 0)}
              placeholder={movement.rxWeights?.male?.toString() || 'kg'}
              min="0"
            />
            <span className={styles.movementUnit}>kg</span>
          </span>
        )}
        {!isWeighted && movement.rxWeights && (
          <span className={styles.movementStat}>
            <span className={styles.movementValue}>
              {movement.rxWeights.female || movement.rxWeights.male}/{movement.rxWeights.male}
            </span>
            <span className={styles.movementUnit}>{movement.rxWeights.unit || 'kg'}</span>
          </span>
        )}
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
  onAlternativeChange: (originalName: string, alternativeName: string | null, newDistance?: number) => void;
  onDistanceChange: (movementName: string, distance: number) => void;
  onTimeChange: (movementName: string, time: number) => void;
  onWeightChange: (movementName: string, weight: number) => void;
  readOnly?: boolean;
}

export function MovementListEditor({
  movements,
  selectedAlternatives,
  customDistances,
  customTimes,
  customWeights,
  onAlternativeChange,
  onDistanceChange,
  onTimeChange,
  onWeightChange,
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
          onAlternativeChange={onAlternativeChange}
          onDistanceChange={onDistanceChange}
          onTimeChange={onTimeChange}
          onWeightChange={onWeightChange}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}
