import type { FocusEvent } from 'react';
import type { ParsedMovement } from '../../types';
import { getExerciseAlternatives, findExerciseDefinition, getAlternativeType } from '../../data/exerciseDefinitions';
import styles from './InlineMovementEditor.module.css';

/**
 * Generate unique keys for a movements array.
 * If a name appears more than once, subsequent occurrences get a "::1", "::2" suffix.
 * Unique names keep their plain name as key.
 */
export function getMovementKeys(movements: ParsedMovement[]): string[] {
  const counts = new Map<string, number>();
  // First pass: count occurrences
  for (const m of movements) {
    counts.set(m.name, (counts.get(m.name) || 0) + 1);
  }
  // Second pass: assign keys
  const seen = new Map<string, number>();
  return movements.map(m => {
    const total = counts.get(m.name) || 1;
    if (total === 1) return m.name; // unique — no suffix
    const idx = seen.get(m.name) || 0;
    seen.set(m.name, idx + 1);
    return idx === 0 ? m.name : `${m.name}::${idx}`;
  });
}

/**
 * Look up a value from a name-keyed map using a movement key.
 * Tries the full key first, falls back to plain name (for backward compat with saved data).
 */
export function movementLookup<T>(map: Record<string, T>, key: string, plainName: string): T | undefined {
  return map[key] ?? (key !== plainName ? map[plainName] : undefined);
}

interface MovementEditorProps {
  movement: ParsedMovement;
  // Current values
  selectedAlternative?: string;
  customDistance?: number;
  customTime?: number;
  customWeight?: number;
  customReps?: number;
  customCalories?: number;
  // KB/DB implement count (only passed for KB/DB movements)
  implementCount?: 1 | 2;
  implementFixed?: boolean; // true = auto-determined, don't show selector
  // Callbacks
  onAlternativeChange?: (originalName: string, alternativeName: string | null, newDistance?: number) => void;
  onDistanceChange?: (movementName: string, distance: number) => void;
  onTimeChange?: (movementName: string, time: number) => void;
  onWeightChange?: (movementName: string, weight: number) => void;
  onRepsChange?: (movementName: string, reps: number) => void;
  onCaloriesChange?: (movementName: string, calories: number) => void;
  onImplementCountChange?: (movementName: string, count: 1 | 2) => void;
  // Display options
  showWeight?: boolean;
  readOnly?: boolean;
  /** When true, reps input shows empty (user enters total), mov.reps becomes placeholder */
  totalRepsMode?: boolean;
}

// Check if a movement requires weight input
function isWeightedMovement(movement: ParsedMovement): boolean {
  // Calorie/distance inputs are never weighted (cardio machines)
  if (movement.inputType === 'calories' || movement.inputType === 'distance') return false;

  // Explicit bodyweight flag from AI — trust it
  if (movement.isBodyweight) return false;
  if (movement.inputType === 'none') return false;

  if (movement.rxWeights) return true;

  const name = movement.name.toLowerCase();

  // Known bodyweight squat variants — never show weight
  const bodyweightPatterns = ['air squat', 'pistol', 'jump squat', 'squat jump', 'squat thrust'];
  if (bodyweightPatterns.some(p => name.includes(p))) return false;

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

  // Exact name mappings
  const exactMap: Record<string, string> = {
    // Overhead movements
    'overhead lunge': 'OH Lunges',
    'overhead lunges': 'OH Lunges',
    'oh lunge': 'OH Lunges',
    'oh lunges': 'OH Lunges',
    'overhead squat': 'OH Squat',
    'oh squat': 'OH Squat',
    'overhead walk': 'OH Walk',
    'oh walk': 'OH Walk',
    'overhead carry': 'OH Carry',
    'oh carry': 'OH Carry',

    // Dumbbell movements
    'db snatch': 'DB Snatch',
    'dumbbell snatch': 'DB Snatch',
    'db clean': 'DB Clean',
    'dumbbell clean': 'DB Clean',
    'db press': 'DB Press',
    'dumbbell press': 'DB Press',
    'db thruster': 'DB Thruster',
    'dumbbell thruster': 'DB Thruster',
    'db squat': 'DB Squat',
    'dumbbell squat': 'DB Squat',
    'db lunge': 'DB Lunge',
    'db lunges': 'DB Lunges',
    'dumbbell lunge': 'DB Lunge',
    'db deadlift': 'DB Deadlift',
    'dumbbell deadlift': 'DB Deadlift',
    'db row': 'DB Row',
    'dumbbell row': 'DB Row',
    'db curl': 'DB Curl',
    'dumbbell curl': 'DB Curl',

    // Kettlebell movements
    'russian kettlebell swing': 'KB Swings',
    'russian kettlebell swings': 'KB Swings',
    'kettlebell swing': 'KB Swings',
    'kettlebell swings': 'KB Swings',
    'american kettlebell swing': 'KB Swings',
    'american kettlebell swings': 'KB Swings',

    // Gymnastics
    'v-up': 'V-ups',
    'v up': 'V-ups',
    'v-ups': 'V-ups',
    'pull-up': 'Pull-ups',
    'pull up': 'Pull-ups',
    'pull-ups': 'Pull-ups',
    'pullup': 'Pull-ups',
    'pullups': 'Pull-ups',
    'push-up': 'Push-ups',
    'push up': 'Push-ups',
    'push-ups': 'Push-ups',
    'pushup': 'Push-ups',
    'pushups': 'Push-ups',
    'sit-up': 'Sit-ups',
    'sit up': 'Sit-ups',
    'sit-ups': 'Sit-ups',
    'situp': 'Sit-ups',
    'situps': 'Sit-ups',
    'box jump': 'Box Jumps',
    'box jumps': 'Box Jumps',
    'burpee': 'Burpees',
    'burpees': 'Burpees',
    'double under': 'Double-unders',
    'double unders': 'Double-unders',
    'double-under': 'Double-unders',
    'double-unders': 'Double-unders',
    'toes to bar': 'Toes-to-bar',
    'toes-to-bar': 'Toes-to-bar',
    't2b': 'Toes-to-bar',
    'muscle up': 'Muscle-ups',
    'muscle-up': 'Muscle-ups',
    'muscle ups': 'Muscle-ups',
    'muscle-ups': 'Muscle-ups',
    'ring dip': 'Ring Dips',
    'ring dips': 'Ring Dips',
    'wall ball': 'Wall Balls',
    'wall balls': 'Wall Balls',
    'handstand push up': 'HSPUs',
    'handstand push-up': 'HSPUs',
    'handstand pushup': 'HSPUs',
    'hspu': 'HSPUs',
    'hspus': 'HSPUs',

    // Hang variations
    'hang clean': 'Hang Clean',
    'hang snatch': 'Hang Snatch',
    'hang power clean': 'HPC',
    'hang power snatch': 'HPS',
    'hpc': 'HPC',
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
  customCalories,
  implementCount,
  implementFixed,
  onAlternativeChange,
  onDistanceChange,
  onTimeChange,
  onWeightChange,
  onRepsChange,
  onCaloriesChange,
  onImplementCountChange,
  showWeight,
  readOnly = false,
  totalRepsMode = false,
}: MovementEditorProps) {
  const definedAlternatives = getExerciseAlternatives(movement.name);
  // Include parsed alternative (from OR option like "40 DU / 60 singles") if not already in list
  const parsedAlt = movement.alternative;
  const hasParsedAlt = parsedAlt && !definedAlternatives.some(a => a.name.toLowerCase() === parsedAlt.name.toLowerCase());
  const parsedAltType = parsedAlt ? getAlternativeType(movement.name, parsedAlt.name) : null;
  const alternatives = hasParsedAlt
    ? [{
        name: parsedAlt.name,
        type: (parsedAltType || 'harder') as 'easier' | 'equivalent' | 'harder',
      }, ...definedAlternatives]
    : definedAlternatives;
  const hasAlternatives = alternatives.length > 0;
  const isWeighted = showWeight === undefined ? isWeightedMovement(movement) : showWeight;
  const hasDistance = movement.distance !== undefined && movement.distance > 0;
  const hasTime = movement.time !== undefined && movement.time > 0;
  const hasCalories = movement.calories !== undefined && movement.calories > 0;
  const hasReps = movement.reps !== undefined && movement.reps > 0;

  // Check what the exercise supports
  const exerciseDef = findExerciseDefinition(movement.name);
  const supportsTime = exerciseDef?.supportsUnits?.includes('time') || hasTime;

  // Display name (either selected alternative or original)
  // Prefix with prescribed reps (e.g., "1× Power Clean") — trust the AI
  const displayName = selectedAlternative || movement.name;
  const displayLabel = abbreviateMovementLabel(displayName);

  const isSubstituted = selectedAlternative && selectedAlternative !== movement.name;

  // Display values (custom or original)
  const displayDistance = customDistance ?? movement.distance;
  const displayTime = customTime ?? movement.time;
  // In totalRepsMode, don't pre-fill with per-round reps — user enters their total
  const displayReps = totalRepsMode ? customReps : (customReps ?? movement.reps);
  const displayCalories = customCalories ?? movement.calories;
  const displayUnit = movement.unit || 'm';

  // Use exercise's defaultUnit to pick the right primary metric
  const defaultUnit = exerciseDef?.defaultUnit;

  // Shuttle runs: distance is just the shuttle length (e.g. 7m), not a workout metric.
  // Time is defined by the EMOM structure, not an editable input.
  // Suppress both — the card just shows the movement name.
  const isShuttleRun = /shuttle/i.test(movement.name);

  // Non-machine cardio (run, shuttle run, bear crawl, etc.) prescribed by time:
  // distance is unmeasurable, so suppress it and show time instead.
  // Machine cardio (bike, rower, ski erg) keeps distance/calories because they're measurable.
  const isMachineCardio = exerciseDef?.category === 'cardio' &&
    /\b(bike|row|ski|erg|assault|echo|air\s?runner)\b/i.test(movement.name);
  const timePrescribedNoDistance = hasTime && hasDistance && !isMachineCardio;

  // Determine what metrics to show
  // Reps prescribed by the AI are shown as a prefix on the movement name,
  // not as a separate editable input. Trust the AI's prescription.
  const showRepsInput = (hasReps || movement.isMaxReps === true) && movement.inputType !== 'calories';
  const showDistanceInput = hasDistance && !timePrescribedNoDistance && !isShuttleRun;
  const showCaloriesInput = hasCalories || movement.inputType === 'calories' || (defaultUnit === 'calories' && !hasReps && !hasDistance);
  const showTimeInput = !isShuttleRun && (hasTime || (supportsTime && !showDistanceInput && !hasCalories)) && !(defaultUnit === 'calories' && showCaloriesInput);
  const showWeightInput = isWeighted;

  // Select all text on focus for easy overwriting
  const handleSelectOnFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.currentTarget.select();
  };

  const handleAlternativeSelect = (value: string) => {
    if (!onAlternativeChange) return;

    if (value === '' || value === movement.name) {
      onAlternativeChange(movement.name, null, movement.distance);
      // Restore original reps if switching back
      if (movement.reps && onRepsChange) {
        onRepsChange(movement.name, movement.reps);
      }
    } else {
      const alt = alternatives.find(a => a.name === value);
      const newDistance = alt?.distanceMultiplier && movement.distance
        ? Math.round(movement.distance * alt.distanceMultiplier)
        : movement.distance;
      onAlternativeChange(movement.name, value, newDistance);

      // If selecting a parsed alternative with custom reps, apply them
      if (parsedAlt && value === parsedAlt.name && parsedAlt.reps && onRepsChange) {
        onRepsChange(movement.name, parsedAlt.reps);
      }
    }
  };

  // Determine primary value and unit — respect exercise's defaultUnit for priority
  const getPrimaryValue = () => {
    if (showRepsInput) return { value: displayReps, unit: 'reps', type: 'reps' as const };
    // For cardio machines (defaultUnit: calories), prefer calories over distance/time
    if (defaultUnit === 'calories' && showCaloriesInput) return { value: displayCalories, unit: 'cal', type: 'calories' as const };
    if (showDistanceInput) return { value: displayDistance, unit: displayUnit, type: 'distance' as const };
    if (showCaloriesInput) return { value: displayCalories, unit: 'cal', type: 'calories' as const };
    if (showTimeInput) return { value: displayTime, unit: 'sec', type: 'time' as const };
    return null;
  };

  const primary = getPrimaryValue();

  const hasImplementToggle = implementCount !== undefined && !implementFixed && !readOnly && onImplementCountChange;

  return (
    <div className={`${styles.movementCard} ${isSubstituted ? styles.substituted : ''}`}>
      {/* NAME HEADER — full width */}
      <div className={styles.nameColumn}>
        {hasAlternatives ? (
          <select
            className={`${styles.movementSelect} ${isSubstituted ? styles.substitutedSelect : ''}`}
            value={selectedAlternative || movement.name}
            onChange={(e) => handleAlternativeSelect(e.target.value)}
            disabled={readOnly}
          >
            <option value={movement.name}>{abbreviateMovementLabel(movement.name)}</option>
            {alternatives.map((alt) => {
              const altReps = (parsedAlt && alt.name === parsedAlt.name && parsedAlt.reps)
                ? parsedAlt.reps
                : undefined;
              const altPrefix = altReps ? `${altReps}× ` : '';
              return (
                <option key={alt.name} value={alt.name}>
                  {altPrefix}{abbreviateMovementLabel(alt.name)}
                  {alt.type === 'easier' ? ' (scaled)' : alt.type === 'harder' ? ' (Rx+)' : ''}
                </option>
              );
            })}
          </select>
        ) : (
          <div className={styles.movementName}>
            {displayLabel}
          </div>
        )}
      </div>

      {/* INPUT ROW — value, implement toggle, weight */}
      {(primary || showWeightInput || hasImplementToggle) && (
        <div className={styles.inputRow}>
          {primary && (
            <div className={styles.valueGroup}>
              {!readOnly ? (
                <input
                  type="number"
                  inputMode="numeric"
                  enterKeyHint="next"
                  className={styles.valueInput}
                  value={primary.value ?? ''}
                  placeholder={totalRepsMode && primary.type === 'reps' ? 'total' : ''}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    if (primary.type === 'reps') onRepsChange?.(movement.name, val);
                    else if (primary.type === 'distance') onDistanceChange?.(movement.name, val);
                    else if (primary.type === 'time') onTimeChange?.(movement.name, val);
                    else if (primary.type === 'calories') onCaloriesChange?.(movement.name, val);
                  }}
                  onFocus={handleSelectOnFocus}
                  min="0"
                />
              ) : (
                <div className={styles.valueDisplay}>{primary.value}</div>
              )}
              <span className={styles.unitLabel}>{primary.unit}</span>
            </div>
          )}

          {hasImplementToggle && (
            <div className={styles.implementSelector}>
              <button
                type="button"
                className={`${styles.implementButton} ${implementCount === 1 ? styles.implementActive : ''}`}
                onClick={() => onImplementCountChange!(movement.name, 1)}
              >
                1x
              </button>
              <button
                type="button"
                className={`${styles.implementButton} ${implementCount === 2 ? styles.implementActive : ''}`}
                onClick={() => onImplementCountChange!(movement.name, 2)}
              >
                2x
              </button>
            </div>
          )}

          {showWeightInput && (
            <div className={styles.weightGroup}>
              {!readOnly ? (
                <input
                  type="number"
                  inputMode="decimal"
                  enterKeyHint="next"
                  className={styles.weightInput}
                  value={customWeight || ''}
                  onChange={(e) => onWeightChange?.(movement.name, parseFloat(e.target.value) || 0)}
                  onFocus={handleSelectOnFocus}
                  placeholder={movement.rxWeights?.male?.toString() || ''}
                  min="0"
                />
              ) : movement.rxWeights ? (
                <div className={styles.valueDisplay}>
                  {movement.rxWeights.male}
                </div>
              ) : null}
              <span className={styles.unitLabel}>kg</span>
            </div>
          )}
        </div>
      )}
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
  customCalories?: Record<string, number>;
  // Per-movement KB/DB implement counts
  movementImplementCounts?: Record<string, 1 | 2>;
  movementImplementFixed?: Record<string, boolean>;
  onAlternativeChange: (originalName: string, alternativeName: string | null, newDistance?: number) => void;
  onDistanceChange: (movementName: string, distance: number) => void;
  onTimeChange: (movementName: string, time: number) => void;
  onWeightChange: (movementName: string, weight: number) => void;
  onRepsChange: (movementName: string, reps: number) => void;
  onCaloriesChange?: (movementName: string, calories: number) => void;
  onImplementCountChange?: (movementName: string, count: 1 | 2) => void;
  showWeight?: boolean;
  readOnly?: boolean;
  labels?: string[];
  /** When true, reps inputs show empty — user enters total (for IGGU/team exercises) */
  totalRepsMode?: boolean;
}

export function MovementListEditor({
  movements,
  selectedAlternatives,
  customDistances,
  customTimes,
  customWeights,
  customReps,
  customCalories,
  movementImplementCounts,
  movementImplementFixed,
  onAlternativeChange,
  onDistanceChange,
  onTimeChange,
  onWeightChange,
  onRepsChange,
  onCaloriesChange,
  onImplementCountChange,
  showWeight,
  readOnly = false,
  labels,
  totalRepsMode = false,
}: MovementListEditorProps) {
  const keys = getMovementKeys(movements);

  // Detect barbell complex: 2+ weighted movements → single shared weight input
  const weightedEntries = movements
    .map((m, i) => ({ movement: m, key: keys[i] }))
    .filter(({ movement }) => isWeightedMovement(movement));
  const isBarbellComplex = weightedEntries.length >= 2;

  console.warn('🔍 [MovementListEditor]', {
    movements: movements.map(m => ({ name: m.name, inputType: m.inputType, rxWeights: m.rxWeights })),
    weightedEntries: weightedEntries.map(e => e.movement.name),
    isBarbellComplex,
  });

  const sharedWeight = isBarbellComplex
    ? (customWeights[weightedEntries[0].key] ?? undefined)
    : undefined;

  const handleSharedWeightChange = (val: number) => {
    weightedEntries.forEach(({ key }) => onWeightChange(key, val));
  };

  const handleSelectOnFocus = (e: FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  return (
    <div className={styles.movementList}>
      {totalRepsMode && (
        <div className={styles.teamHint}>Log your personal numbers</div>
      )}
      {isBarbellComplex && (
        <div className={styles.barbellComplexRow}>
          <span className={styles.barbellLabel}>Barbell</span>
          <div className={styles.weightGroup}>
            {!readOnly ? (
              <input
                type="number"
                inputMode="decimal"
                enterKeyHint="done"
                className={styles.weightInput}
                value={sharedWeight ?? ''}
                onChange={(e) => handleSharedWeightChange(parseFloat(e.target.value) || 0)}
                onFocus={handleSelectOnFocus}
                placeholder={weightedEntries[0].movement.rxWeights?.male?.toString() || ''}
                min="0"
                aria-label="Barbell weight in kilograms"
              />
            ) : sharedWeight ? (
              <div className={styles.valueDisplay}>{sharedWeight}</div>
            ) : null}
            <span className={styles.unitLabel}>kg</span>
          </div>
        </div>
      )}
      {movements.map((movement, index) => {
        const key = keys[index];
        return (
          <div key={`${movement.name}-${index}`}>
            {labels?.[index] && (
              <span className={styles.movementMinuteLabel}>{labels[index]}</span>
            )}
            <InlineMovementEditor
              movement={movement}
              selectedAlternative={selectedAlternatives[key]}
              customDistance={customDistances[key]}
              customTime={customTimes[key]}
              customWeight={customWeights[key]}
              customReps={customReps[key]}
              customCalories={customCalories?.[key]}
              implementCount={movementImplementCounts?.[key]}
              implementFixed={movementImplementFixed?.[key]}
              onAlternativeChange={(_name, alt, dist) => onAlternativeChange(key, alt, dist)}
              onDistanceChange={(_name, dist) => onDistanceChange(key, dist)}
              onTimeChange={(_name, time) => onTimeChange(key, time)}
              onWeightChange={(_name, weight) => onWeightChange(key, weight)}
              onRepsChange={(_name, reps) => onRepsChange(key, reps)}
              onCaloriesChange={onCaloriesChange ? (_name, cal) => onCaloriesChange(key, cal) : undefined}
              onImplementCountChange={onImplementCountChange ? (_name, count) => onImplementCountChange(key, count) : undefined}
              showWeight={isBarbellComplex ? false : showWeight}
              readOnly={readOnly}
              totalRepsMode={totalRepsMode}
            />
          </div>
        );
      })}
    </div>
  );
}
