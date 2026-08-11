import { useCallback, useMemo, useState } from 'react';
import type { StoryExerciseResult, MovementResult } from './types';
import { kindToTrinityColor, getWeightStep, getWeightMax } from './types';
import { movementLoadUnit } from '../../../utils/loadUnits';
import {
  getMovementEquipmentType,
  resolveLoadBlocks,
  resolveMovementEquipment,
  type LoadBlock,
  type LoadEquipment,
} from './loadGroups';
import { ProgressiveWeightRow } from './ProgressiveWeightRow';
import { StepperInput } from './StepperInput';
import { SubstitutionSheet } from './SubstitutionSheet';
import { hasAlternatives, findExerciseDefinition } from '../../../data/exerciseDefinitions';
import type { MovementSubstitution } from '../../../types';
import styles from './SupersetInput.module.css';

interface SupersetInputProps {
  result: StoryExerciseResult;
  onChange: (patch: Partial<StoryExerciseResult>) => void;
}

/** What ONE weight input covers: a load block, or a single movement split out of one. */
type WeightInput = LoadBlock;

/** What a merged card is claiming to be — the reason it asks for a single number. */
const ONE_LOAD_NOUN: Record<LoadEquipment, string> = {
  barbell: 'One bar',
  db: 'One DB load',
  kb: 'One KB load',
  other: 'One load',
};

/** Board-order render slot: a shared weight input, or one movement's own row. */
type RenderItem =
  | { type: 'weight'; input: WeightInput }
  | { type: 'row'; mr: MovementResult; index: number };

/**
 * Renders compact per-movement input rows for supersets, complexes and strength circuits.
 * Every distinct load in the piece gets its own weight input; movements that truly share an
 * implement share one, with an escape hatch to split them apart.
 */
export function SupersetInput({ result, onChange }: SupersetInputProps) {
  // Stable identity: everything below memoises on this list, and a fresh `[]` each render
  // would re-derive every load block on every keystroke.
  const movements = useMemo(() => result.movementResults ?? [], [result.movementResults]);

  const equipmentByKey = useMemo(() => resolveMovementEquipment(movements), [movements]);

  const getMovementEquipment = useCallback((mr: MovementResult): LoadEquipment => (
    equipmentByKey.get(mr.movementKey) ?? getMovementEquipmentType(mr.movement)
  ), [equipmentByKey]);

  // Every distinct load the athlete has to state. Only a complex — the AI's word for one bar
  // taken through an unbroken sequence — collapses its movements into a single weight; a
  // strength circuit asks each station separately. See resolveLoadBlocks.
  const isComplex = result.exercise.complex === true;
  const loadBlocks = useMemo<LoadBlock[]>(
    () => resolveLoadBlocks(movements, getMovementEquipment, isComplex),
    [movements, getMovementEquipment, isComplex],
  );

  // Blocks the athlete pulled apart ("use different weights for each"): same rows, own numbers.
  const [splitBlockKeys, setSplitBlockKeys] = useState<Set<string>>(() => new Set());

  const weightInputs = useMemo<WeightInput[]>(() => loadBlocks.flatMap((block) => (
    splitBlockKeys.has(block.key) && block.movements.length > 1
      ? block.movements.map((mr) => ({ key: `${block.key}:${mr.movementKey}`, type: block.type, movements: [mr] }))
      : [block]
  )), [loadBlocks, splitBlockKeys]);

  // A start->peak input only means something across multiple sets. The block states its own
  // count when it has one (sequential blocks each repeat on their own).
  const inputSetsTotal = useCallback((input: WeightInput): number => (
    input.movements[0]?.sectionRounds ?? result.setsTotal
  ), [result.setsTotal]);

  const updateMovement = useCallback((index: number, patch: Partial<MovementResult>) => {
    const next = [...(result.movementResults ?? [])];
    next[index] = { ...next[index], ...patch };
    onChange({ movementResults: next });
  }, [result.movementResults, onChange]);

  // The entered load belongs to THIS input's movements and to no others. Writing it per
  // movement — never onto the parent result — is what lets one block build 40->50kg while the
  // DB row beside it stays at 22.5kg; the save path reads each movement's own weight/weightEnd.
  const applyLoad = useCallback((
    target: MovementResult[],
    start: number | undefined,
    peak: number | undefined,
  ) => {
    const keys = new Set(target.map((mr) => mr.movementKey));
    const next = (result.movementResults ?? []).map((mr) => (
      keys.has(mr.movementKey)
        ? {
            ...mr,
            weight: start,
            weightEnd: peak,
            loadMode: peak != null && start != null && peak !== start
              ? ('range' as const)
              : ('same' as const),
          }
        : mr
    ));
    onChange({ movementResults: next });
  }, [result.movementResults, onChange]);

  const [swapOpenKey, setSwapOpenKey] = useState<string | null>(null);
  const swapMr = swapOpenKey != null
    ? movements.find(m => m.movementKey === swapOpenKey) ?? null
    : null;

  const handleSubstitution = useCallback((sub: MovementSubstitution | null) => {
    if (!swapMr) return;
    const idx = movements.indexOf(swapMr);
    if (idx < 0) return;
    const patch: Partial<MovementResult> = { substitution: sub };
    if (sub?.adjustedValue != null) {
      if (sub.targetUnit) {
        if (sub.targetUnit === 'distance') {
          patch.distance = sub.adjustedValue;
          patch.calories = undefined;
        } else if (sub.targetUnit === 'calories') {
          patch.calories = sub.adjustedValue;
          patch.distance = undefined;
        }
      } else {
        // Legacy fallback
        const originIsDistance = swapMr.kind === 'distance'
          || (swapMr.movement.distance != null && swapMr.movement.distance > 0);
        const originIsCal = !originIsDistance && (
          swapMr.movement.inputType === 'calories' ||
          (swapMr.movement.calories != null && swapMr.movement.calories > 0)
        );
        if (originIsDistance) {
          patch.distance = sub.adjustedValue;
          patch.calories = undefined;
        } else if (originIsCal) {
          patch.calories = sub.adjustedValue;
          patch.distance = undefined;
        } else {
          const targetDef = findExerciseDefinition(sub.selectedName);
          const targetUsesCal = targetDef?.defaultUnit === 'calories';
          if (targetUsesCal) {
            patch.calories = sub.adjustedValue;
          } else if (swapMr.movement.distance != null) {
            patch.distance = sub.adjustedValue;
          }
        }
      }
    } else if (!sub) {
      const isCal = swapMr.movement.inputType === 'calories' || (swapMr.movement.calories != null && swapMr.movement.calories > 0);
      if (isCal) patch.calories = swapMr.movement.calories ?? undefined;
      else if (swapMr.movement.distance != null) {
        patch.distance = swapMr.movement.distance;
        patch.calories = undefined;
      }
    }
    updateMovement(idx, patch);
    setSwapOpenKey(null);
  }, [swapMr, movements, updateMovement]);

  // Sequential blocks can repeat the same lift ("4 sets: 2 Clean & Jerk / Into: 4 sets: 1 Clean
  // & Jerk"). Two identically-titled cards read as a duplicate bug, so a repeated name carries
  // its own block's scheme (CLEAN & JERK · 4×2) to say which block it is.
  const blockLabel = useCallback((mr: MovementResult): string => {
    const isRepeatedName = movements.filter(
      (m) => m.movement.name.toLowerCase() === mr.movement.name.toLowerCase(),
    ).length > 1;
    const sets = mr.sectionRounds ?? result.setsTotal;
    const reps = mr.movement.reps;
    return isRepeatedName && sets > 1 && reps
      ? `${mr.movement.name} · ${sets}×${reps}`
      : mr.movement.name;
  }, [movements, result.setsTotal]);

  // The badge states THIS input's own prescription. Several movements on one implement only
  // have a single rep count when the board gave them the same one — a circuit of 5 press /
  // 10 row / 8 SLDL has none, and ProgressiveWeightRow falls back to the set count. One
  // member's reps must never be spoken for the rest.
  const inputReps = useCallback((input: WeightInput): number | undefined => {
    if (input.movements.length === 1) {
      return input.movements[0].movement.reps ?? result.exercise.suggestedReps;
    }
    const reps = input.movements
      .map((mr) => mr.movement.reps)
      .filter((n): n is number => typeof n === 'number' && n > 0);
    if (reps.length !== input.movements.length) return undefined;
    return reps.every((n) => n === reps[0]) ? reps[0] : undefined;
  }, [result.exercise.suggestedReps]);

  // A weight input says exactly what it buys: one movement names itself, a shared implement
  // names every movement it covers. A bare "BARBELL" is what let a DB row hide behind a bar.
  const inputLabel = useCallback((input: WeightInput): string => (
    input.movements.map(blockLabel).join(' + ')
  ), [blockLabel]);

  // Render plan in board order: a load movement is replaced by its weight input at the position
  // of the input's FIRST movement, so nothing silently disappears and nothing is asked twice.
  // Loads whose input spans a single set keep their inline row — there is no build to log.
  const renderPlan = useMemo<RenderItem[]>(() => {
    const inputOf = new Map<string, WeightInput>();
    weightInputs.forEach((input) => {
      if (inputSetsTotal(input) <= 1) return;
      input.movements.forEach((mr) => inputOf.set(mr.movementKey, input));
    });
    const emitted = new Set<string>();
    return movements.flatMap<RenderItem>((mr, index) => {
      const input = inputOf.get(mr.movementKey);
      if (!input) return [{ type: 'row', mr, index }];
      if (emitted.has(input.key)) return [];
      emitted.add(input.key);
      return [{ type: 'weight', input }];
    });
  }, [movements, weightInputs, inputSetsTotal]);

  // ── How many loads this piece still owes ──────────────────────────
  // A strength circuit asks for one weight per station, and the first card is the lift the
  // athlete came for. Without a running count the cards below it read as optional detail and
  // get scrolled past, so the block states up front how many weights it wants and how many
  // are in — and names the ones still missing at the bottom, right above the wizard's Next.
  const weightItems = useMemo(
    () => renderPlan.filter((item): item is Extract<RenderItem, { type: 'weight' }> => item.type === 'weight'),
    [renderPlan],
  );
  const loadsTotal = weightItems.length;
  const loadsFilled = weightItems.filter(({ input }) => isInputFilled(input)).length;
  const showProgress = loadsTotal > 1;
  const missingNames = weightItems
    .filter(({ input }) => !isInputFilled(input))
    .map(({ input }) => inputLabel(input));

  const loadNumberOf = useMemo(() => {
    const nums = new Map<string, number>();
    weightItems.forEach(({ input }, i) => nums.set(input.key, i + 1));
    return nums;
  }, [weightItems]);

  // Escape hatch in the other direction: several stations on the SAME implement can genuinely
  // have been one pick-up (a "+"-joined complex the AI didn't flag). Offered only when every
  // input is that one implement — copying a bar weight onto a DB row is never the intent.
  const firstFilled = weightItems.find(({ input }) => isInputFilled(input))?.input;
  const canCopyAcross = showProgress
    && firstFilled != null
    && loadsFilled < loadsTotal
    && weightItems.every(({ input }) => input.type === weightItems[0].input.type);

  const applyToAll = useCallback(() => {
    if (!firstFilled) return;
    const anchor = firstFilled.movements.find((mr) => mr.weight != null) ?? firstFilled.movements[0];
    applyLoad(weightItems.flatMap(({ input }) => input.movements), anchor.weight, anchor.weightEnd);
  }, [firstFilled, weightItems, applyLoad]);

  return (
    <>
      <div className={styles.container}>
        {showProgress && (
          <div className={styles.loadProgress}>
            <span className={styles.loadProgressLabel}>Weights to log</span>
            <div className={styles.loadPips} aria-hidden="true">
              {weightItems.map(({ input }) => (
                <span
                  key={input.key}
                  className={`${styles.loadPip} ${isInputFilled(input) ? styles.loadPipDone : ''}`}
                />
              ))}
            </div>
            <span className={styles.loadProgressCount}>
              <strong>{loadsFilled}</strong>/{loadsTotal}
            </span>
          </div>
        )}

        {renderPlan.map((item) => {
          if (item.type === 'weight') {
            const { input } = item;
            const anchor = input.movements.find((mr) => mr.weight != null) ?? input.movements[0];
            const loadUnit = movementLoadUnit(anchor.movement);
            const num = loadNumberOf.get(input.key);
            const filled = isInputFilled(input);
            // A card covering several movements must account for all of them: the title states
            // the claim ("One bar · 3 lifts"), the sub-line names them, and the split button
            // takes them apart. That is what makes trusting the AI's `complex` call safe — a
            // wrong call costs a tap, instead of leaving a lift with nowhere to be entered.
            const merged = input.movements.length > 1;
            return (
              <div key={input.key} className={styles.loadBlock}>
                <ProgressiveWeightRow
                  pending={showProgress && !filled}
                  weight={anchor.weight}
                  peakWeight={anchor.weightEnd}
                  placeholder={anchor.movement.rxWeights?.male}
                  setsTotal={inputSetsTotal(input)}
                  repsPerSet={inputReps(input)}
                  step={getWeightStep(anchor.movement.name, anchor.movement.equipment, loadUnit)}
                  unit={loadUnit}
                  onChange={(start, peak) => applyLoad(input.movements, start, peak)}
                  label={merged
                    ? `${ONE_LOAD_NOUN[input.type]} · ${input.movements.length} lifts`
                    : showProgress && num ? `${num} · ${inputLabel(input)}` : inputLabel(input)}
                  subLabel={merged ? inputLabel(input) : undefined}
                />
                {merged && (
                  <button
                    type="button"
                    className={styles.splitLink}
                    onClick={() => setSplitBlockKeys((prev) => new Set(prev).add(input.key))}
                  >
                    Log these separately {'->'}
                  </button>
                )}
              </div>
            );
          }

          const { mr, index } = item;
          return (
            <MovementRow
              key={mr.movementKey}
              mr={mr}
              onUpdate={(patch) => updateMovement(index, patch)}
              onSwapTap={hasAlternatives(mr.movement.name) || !!mr.movement.alternative
                ? () => setSwapOpenKey(mr.movementKey)
                : undefined}
            />
          );
        })}

        {missingNames.length > 0 && showProgress && (
          <div className={styles.loadFooter}>
            <p className={styles.loadRemaining}>
              <strong>
                {missingNames.length} weight{missingNames.length > 1 ? 's' : ''} left
              </strong>
              <span className={styles.loadRemainingNames}>{missingNames.join(' · ')}</span>
            </p>
            {canCopyAcross && (
              <button type="button" className={styles.sameWeightLink} onClick={applyToAll}>
                Same weight for all {'->'}
              </button>
            )}
          </div>
        )}
      </div>

      {swapMr && (
        <SubstitutionSheet
          open={swapOpenKey != null}
          originalName={swapMr.movement.name}
          originalReps={swapMr.movement.reps}
          originalDistance={swapMr.movement.distance}
          originalCalories={swapMr.movement.calories}
          currentSubstitution={swapMr.substitution}
          aiAlternative={swapMr.movement.alternative}
          onSelect={handleSubstitution}
          onClose={() => setSwapOpenKey(null)}
        />
      )}
    </>
  );
}

// ─── Per-movement row ───────────────────────────────────────────

interface MovementRowProps {
  mr: MovementResult;
  onUpdate: (patch: Partial<MovementResult>) => void;
  onSwapTap?: () => void;
}

function MovementRow({ mr, onUpdate, onSwapTap }: MovementRowProps) {
  const color = kindToTrinityColor(mr.kind);
  const isFilled = isMovementRowFilled(mr);
  const isSubstituted = mr.substitution != null;

  // Build prescription hint
  const hint = buildHint(mr);

  const displayName = isSubstituted ? mr.substitution!.selectedName : mr.movement.name;

  return (
    <div
      className={`${styles.movRow} ${isFilled ? styles.movRowFilled : ''}`}
      style={{ '--mov-color': color } as React.CSSProperties}
    >
      <div className={styles.movHeader}>
        <div className={styles.movNameGroup}>
          {isSubstituted && (
            <span className={styles.movNameOriginalStruck}>{mr.movement.name}</span>
          )}
          <span className={`${styles.movName} ${isSubstituted ? styles.movNameSubstituted : ''}`}>
            {displayName}
          </span>
          {isSubstituted && (
            <span className={`${styles.supBadge} ${
              mr.substitution!.substitutionType === 'easier' ? styles.supBadgeScaled :
              mr.substitution!.substitutionType === 'harder' ? styles.supBadgeRxPlus :
              styles.supBadgeEqual
            }`}>
              {mr.substitution!.substitutionType === 'easier' ? 'SCALED' :
               mr.substitution!.substitutionType === 'harder' ? 'RX+' : 'EQUAL'}
            </span>
          )}
        </div>
        {onSwapTap && (
          <button
            type="button"
            className={styles.swapBtn}
            onClick={onSwapTap}
            aria-label={`Scale ${mr.movement.name}`}
          >
            <SwapIcon />
          </button>
        )}
        {hint && <span className={styles.movHint}>{hint}</span>}
      </div>

      <div className={styles.movInputRow}>
        {mr.kind === 'load' && <WeightInline mr={mr} onUpdate={onUpdate} />}
        {mr.kind === 'reps' && <BwConfirmed mr={mr} />}
        {mr.kind === 'duration' && <DurationInline mr={mr} onUpdate={onUpdate} />}
        {mr.kind === 'distance' && <DistanceInline mr={mr} onUpdate={onUpdate} />}
      </div>
    </div>
  );
}

function SwapIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2 4.5h8M8 2.5l2 2-2 2M12 9.5H4M4 7.5l-2 2 2 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Inline inputs ──────────────────────────────────────────────

function WeightInline({ mr, onUpdate }: { mr: MovementResult; onUpdate: (p: Partial<MovementResult>) => void }) {
  const loadUnit = movementLoadUnit(mr.movement);
  const unitLabel = mr.implementCount === 2 ? `2× ${loadUnit}` : loadUnit;
  const placeholder = mr.movement.rxWeights?.male ? String(mr.movement.rxWeights.male) : '0';

  return (
    <StepperInput
      value={mr.weight}
      onChange={(v) => onUpdate({ weight: v != null ? Math.max(0, v) : undefined })}
      step={getWeightStep(mr.movement.name, mr.movement.equipment, loadUnit)}
      min={0}
      max={getWeightMax(loadUnit)}
      placeholder={placeholder}
      unit={unitLabel}
      color={kindToTrinityColor('load')}
      inputMode="decimal"
      size="sm"
    />
  );
}

function BwConfirmed({ mr }: { mr: MovementResult }) {
  const reps = mr.movement.reps;
  return (
    <span className={styles.bwConfirmed}>
      {reps ? `${reps} reps` : 'Bodyweight'}
    </span>
  );
}

function DurationInline({ mr, onUpdate }: { mr: MovementResult; onUpdate: (p: Partial<MovementResult>) => void }) {
  const sec = mr.durationSeconds ?? 0;
  // Generate chips from movement's prescribed time
  const prescribed = mr.movement.time ?? 60;
  const chips = [
    Math.max(10, prescribed - 15),
    prescribed - 5,
    prescribed,
    prescribed + 5,
    prescribed + 15,
  ].filter((v, i, arr) => v > 0 && arr.indexOf(v) === i);

  return (
    <div className={styles.inlineChips}>
      {chips.map((c) => (
        <button
          key={c}
          type="button"
          className={`${styles.inlineChip} ${sec === c ? styles.inlineChipActive : ''}`}
          onClick={() => onUpdate({ durationSeconds: c })}
        >
          {c}s
        </button>
      ))}
    </div>
  );
}

function DistanceInline({ mr, onUpdate }: { mr: MovementResult; onUpdate: (p: Partial<MovementResult>) => void }) {
  const isCalorie = mr.movement.inputType === 'calories' || (mr.movement.calories != null && mr.movement.calories > 0);
  const unit = isCalorie ? 'cal' : (mr.distanceUnit ?? mr.movement.unit ?? 'm');
  const color = kindToTrinityColor('distance');

  if (isCalorie) {
    return (
      <StepperInput
        value={mr.calories}
        onChange={(v) => onUpdate({ calories: v })}
        step={1}
        min={0}
        placeholder={mr.movement.calories ? String(mr.movement.calories) : '0'}
        unit={unit}
        color={color}
        size="sm"
      />
    );
  }

  const step = unit === 'km' ? 0.5 : unit === 'mi' ? 0.1 : 50;
  return (
    <StepperInput
      value={mr.distance}
      onChange={(v) => onUpdate({ distance: v })}
      step={step}
      min={0}
      placeholder={mr.movement.distance ? String(mr.movement.distance) : '0'}
      unit={unit}
      color={color}
      inputMode="decimal"
      size="sm"
    />
  );
}

// ─── Helpers ────────────────────────────────────────────────────

/** A weight input counts as logged once any movement it covers carries a load. */
function isInputFilled(input: WeightInput): boolean {
  return input.movements.some((mr) => mr.weight != null && mr.weight > 0);
}

function isMovementRowFilled(mr: MovementResult): boolean {
  switch (mr.kind) {
    case 'load': return (mr.weight != null && mr.weight > 0) || mr.loadMode === 'bodyweight';
    case 'reps': return true;
    case 'duration': return mr.durationSeconds != null && mr.durationSeconds > 0;
    case 'distance': return (mr.distance != null && mr.distance > 0) || (mr.calories != null && mr.calories > 0);
    default: return true;
  }
}

function buildHint(mr: MovementResult): string {
  const mov = mr.movement;
  const parts: string[] = [];
  if (mov.reps) parts.push(`${mov.reps} reps`);
  if (mov.distance) parts.push(`${mov.distance}m`);
  if (mov.time) parts.push(`${mov.time}s`);
  if (mov.calories) parts.push(`${mov.calories} cal`);
  return parts.join(' · ');
}
