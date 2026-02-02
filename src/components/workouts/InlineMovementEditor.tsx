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
  completed?: boolean;
  // Callbacks
  onAlternativeChange?: (originalName: string, alternativeName: string | null, newDistance?: number) => void;
  onDistanceChange?: (movementName: string, distance: number) => void;
  onTimeChange?: (movementName: string, time: number) => void;
  onWeightChange?: (movementName: string, weight: number) => void;
  onRepsChange?: (movementName: string, reps: number) => void;
  onComplete?: (movementName: string, completed: boolean) => void;
  // Display options
  showWeight?: boolean;
  readOnly?: boolean;
}

// Check if a movement requires weight input (not bodyweight)
function isWeightedMovement(movement: ParsedMovement): boolean {
  if (movement.isBodyweight) return false;
  if (movement.rxWeights) return true;

  const name = movement.name.toLowerCase();
  const weightedPatterns = [
    'deadlift', 'clean', 'jerk', 'snatch', 'squat', 'press', 'thruster',
    'lunge', 'row', 'swing', 'turkish', 'farmer', 'carry', 'curl',
    'bench', 'overhead', 'front rack', 'back rack', 'goblet', 'weighted',
  ];

  if (name.includes('row') && (name.includes('ring') || name.includes('rower') || name.includes('erg'))) {
    return false;
  }

  return weightedPatterns.some(pattern => name.includes(pattern));
}

// Check if movement has fixed reps (prescribed) vs max reps (needs logging)
function isPrescribedReps(movement: ParsedMovement): boolean {
  return typeof movement.reps === 'number' && !movement.isMaxReps;
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
    'weighted pull-up': 'Weighted Pull-up',
    'weighted pull-ups': 'Weighted Pull-ups',
  };

  if (exactMap[lower]) return exactMap[lower];
  return trimmed;
}

/**
 * PRESCRIBED SET ROW
 * For weighted movements with fixed reps (e.g., "3x2 @ 32kg")
 * Shows: [Movement Name] [3x badge] [2 reps @ 32kg] [✓ checkmark]
 */
function PrescribedSetRow({
  movement,
  customWeight,
  completed = false,
  onWeightChange,
  onComplete,
  readOnly = false,
}: {
  movement: ParsedMovement;
  customWeight?: number;
  completed?: boolean;
  onWeightChange?: (movementName: string, weight: number) => void;
  onComplete?: (movementName: string, completed: boolean) => void;
  readOnly?: boolean;
}) {
  const displayName = abbreviateMovementLabel(movement.name);
  const sets = movement.sets || 1;
  const reps = typeof movement.reps === 'number' ? movement.reps : 0;
  const weight = customWeight ?? movement.rxWeights?.male ?? movement.rxWeights?.female ?? 0;
  const unit = movement.rxWeights?.unit || 'kg';

  const handleSelectOnFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.currentTarget.select();
  };

  return (
    <div className={`${styles.prescribedRow} ${completed ? styles.completed : ''}`}>
      {/* Movement name */}
      <div className={styles.prescribedName}>
        <span className={styles.movementLabel}>{displayName}</span>
        {sets > 1 && <span className={styles.setsBadge}>{sets}x</span>}
      </div>

      {/* Prescription: "2 reps @ 32kg" */}
      <div className={styles.prescribedInfo}>
        <span className={styles.repsDisplay}>{reps} reps</span>
        {isWeightedMovement(movement) && (
          <>
            <span className={styles.atSymbol}>@</span>
            {readOnly ? (
              <span className={styles.weightDisplay}>{weight}{unit}</span>
            ) : (
              <div className={styles.weightInputGroup}>
                <input
                  type="number"
                  inputMode="decimal"
                  className={styles.weightInput}
                  value={customWeight || ''}
                  onChange={(e) => onWeightChange?.(movement.name, parseFloat(e.target.value) || 0)}
                  onFocus={handleSelectOnFocus}
                  placeholder={weight.toString()}
                  min="0"
                />
                <span className={styles.weightUnit}>{unit}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Checkmark completion button */}
      <button
        type="button"
        className={`${styles.checkButton} ${completed ? styles.checked : ''}`}
        onClick={() => onComplete?.(movement.name, !completed)}
        disabled={readOnly}
        aria-label={completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {completed ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : null}
      </button>
    </div>
  );
}

/**
 * PERFORMANCE INPUT ROW
 * For bodyweight/max reps movements (e.g., "2 sets max reps")
 * Shows: [Movement Name] [Set #] [____ input] [RECORD REPS hint]
 */
function PerformanceInputRow({
  movement,
  setNumber,
  customReps,
  onRepsChange,
  readOnly = false,
}: {
  movement: ParsedMovement;
  setNumber: number;
  customReps?: number;
  onRepsChange?: (movementName: string, setNumber: number, reps: number) => void;
  readOnly?: boolean;
}) {
  const displayName = abbreviateMovementLabel(movement.name);

  const handleSelectOnFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.currentTarget.select();
  };

  return (
    <div className={styles.performanceRow}>
      {/* Movement name + set number */}
      <div className={styles.performanceName}>
        <span className={styles.movementLabel}>{displayName}</span>
        <span className={styles.setNumber}>Set {setNumber}</span>
      </div>

      {/* Reps input */}
      <div className={styles.performanceInput}>
        <input
          type="number"
          inputMode="numeric"
          enterKeyHint="next"
          className={styles.repsInput}
          value={customReps ?? ''}
          onChange={(e) => onRepsChange?.(movement.name, setNumber, parseInt(e.target.value) || 0)}
          onFocus={handleSelectOnFocus}
          placeholder="—"
          min="0"
          disabled={readOnly}
        />
        <span className={styles.repsHint}>reps</span>
      </div>
    </div>
  );
}

/**
 * SECTION HEADER
 * Visual divider between movement types
 */
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.sectionHeader}>
      <span className={styles.sectionTitle}>{children}</span>
      <div className={styles.sectionLine} />
    </div>
  );
}

// ============================================
// LEGACY SINGLE MOVEMENT EDITOR (for non-strength contexts)
// ============================================
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
  const isMaxReps = movement.isMaxReps === true;

  const exerciseDef = findExerciseDefinition(movement.name);
  const supportsTime = exerciseDef?.supportsUnits?.includes('time') || hasTime;

  const displayName = selectedAlternative || movement.name;
  const baseLabel = abbreviateMovementLabel(displayName);
  const displayLabel = movement.sets ? `${baseLabel} ${movement.sets}x` : baseLabel;

  const displayDistance = customDistance ?? movement.distance;
  const displayTime = customTime ?? movement.time;
  const displayReps = customReps ?? movement.reps;
  const displayUnit = movement.unit || 'm';

  const showTimeInput = hasTime || (supportsTime && !hasDistance && !hasCalories);
  const showDistanceInput = hasDistance;
  const showCaloriesDisplay = hasCalories && !hasDistance && !hasTime;
  // Show reps input for movements with reps OR max reps
  const showRepsInput = movement.reps !== undefined || isMaxReps;
  const showWeightInput = isWeighted;
  const showRxDisplay = !isWeighted && movement.rxWeights;

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

  const renderPrimaryValue = () => {
    if (readOnly) {
      if (showRepsInput && movement.reps) {
        const repsDisplay = isMaxReps ? (customReps ?? 'max') : movement.reps;
        return <span className={styles.staticValue}>{repsDisplay}</span>;
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
          placeholder={isMaxReps ? 'max' : '0'}
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

  const renderUnitOrWeight = () => {
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

    if (showRxDisplay && movement.rxWeights) {
      const weightLabel = `${movement.rxWeights.female || movement.rxWeights.male}/${movement.rxWeights.male}`;
      return <span className={styles.valueUnit}>{weightLabel}{movement.rxWeights.unit || 'kg'}</span>;
    }

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

    return <span className={styles.valueUnit}></span>;
  };

  return (
    <div className={styles.metricStrip}>
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

      <div className={styles.colB}>
        {renderPrimaryValue()}
      </div>

      <div className={styles.colC}>
        {renderUnitOrWeight()}
      </div>
    </div>
  );
}

// ============================================
// STRENGTH MOVEMENT LIST EDITOR
// Groups movements by type with section headers
// ============================================
interface StrengthMovementListProps {
  movements: ParsedMovement[];
  customWeights: Record<string, number>;
  customReps: Record<string, Record<number, number>>; // movementName -> setNumber -> reps
  completedSets: Record<string, boolean>; // movementName -> completed
  onWeightChange: (movementName: string, weight: number) => void;
  onRepsChange: (movementName: string, setNumber: number, reps: number) => void;
  onComplete: (movementName: string, completed: boolean) => void;
  readOnly?: boolean;
}

export function StrengthMovementListEditor({
  movements,
  customWeights,
  customReps,
  completedSets,
  onWeightChange,
  onRepsChange,
  onComplete,
  readOnly = false,
}: StrengthMovementListProps) {
  // Separate movements into prescribed (fixed reps) and performance (max reps)
  const prescribedMovements = movements.filter(m => isPrescribedReps(m));
  const performanceMovements = movements.filter(m => !isPrescribedReps(m));

  return (
    <div className={styles.strengthList}>
      {/* STRENGTH section - prescribed sets with checkmarks */}
      {prescribedMovements.length > 0 && (
        <>
          <SectionHeader>STRENGTH</SectionHeader>
          {prescribedMovements.map((movement, index) => (
            <PrescribedSetRow
              key={`prescribed-${movement.name}-${index}`}
              movement={movement}
              customWeight={customWeights[movement.name]}
              completed={completedSets[movement.name] ?? false}
              onWeightChange={onWeightChange}
              onComplete={onComplete}
              readOnly={readOnly}
            />
          ))}
        </>
      )}

      {/* FINISHER section - bodyweight/max reps with inputs */}
      {performanceMovements.length > 0 && (
        <>
          <SectionHeader>FINISHER</SectionHeader>
          {performanceMovements.map((movement, movIndex) => {
            const sets = movement.sets || 1;
            return Array.from({ length: sets }, (_, setIndex) => (
              <PerformanceInputRow
                key={`performance-${movement.name}-${movIndex}-${setIndex}`}
                movement={movement}
                setNumber={setIndex + 1}
                customReps={customReps[movement.name]?.[setIndex + 1]}
                onRepsChange={onRepsChange}
                readOnly={readOnly}
              />
            ));
          })}
        </>
      )}
    </div>
  );
}

// ============================================
// LEGACY MOVEMENT LIST EDITOR (for metcons, etc.)
// ============================================
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
