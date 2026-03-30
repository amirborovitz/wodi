import { useCallback, useMemo, useState } from 'react';
import type { StoryExerciseResult, MovementResult } from './types';
import { kindToTrinityColor, getWeightStep } from './types';
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

/**
 * Renders compact per-movement input rows for supersets.
 * Detects barbell complexes (2+ weighted movements sharing one bar)
 * and renders a single shared weight input instead of per-movement inputs.
 */
export function SupersetInput({ result, onChange }: SupersetInputProps) {
  const movements = result.movementResults ?? [];

  // Detect barbell complex or single weighted movement needing Start/Top.
  // Show ProgressiveWeightRow when 1+ weighted movements exist with multiple sets.
  const { isComplex, weightedIndices } = useMemo(() => {
    const hints = result.exercise.loggingHints?.sharedWeightMovements;
    if (hints && hints.length >= 2) {
      // AI told us which movements share weight — find their indices
      const indices = movements
        .map((mr, i) => hints.some(h => mr.movement.name === h) ? i : -1)
        .filter(i => i >= 0);
      return { isComplex: indices.length >= 1, weightedIndices: indices };
    }
    // Fallback: 1+ load-kind movements with multiple sets → show Start/Top
    const indices = movements
      .map((mr, i) => mr.kind === 'load' ? i : -1)
      .filter(i => i >= 0);
    const hasMutiSets = result.setsTotal > 1;
    return { isComplex: indices.length >= 1 && hasMutiSets, weightedIndices: indices };
  }, [movements, result.exercise.loggingHints, result.setsTotal]);

  const updateMovement = useCallback((index: number, patch: Partial<MovementResult>) => {
    const next = [...(result.movementResults ?? [])];
    next[index] = { ...next[index], ...patch };
    onChange({ movementResults: next });
  }, [result.movementResults, onChange]);

  const handleProgressiveChange = useCallback((start: number | undefined, peak: number | undefined) => {
    const next = [...(result.movementResults ?? [])];
    for (const idx of weightedIndices) {
      // For progressive mode, all movements get the start weight
      // (per-set interpolation is handled at save time by the caller)
      next[idx] = { ...next[idx], weight: start };
    }
    // Store peak in weightEnd on the parent result for save-time interpolation
    onChange({ movementResults: next, weightEnd: peak, loadMode: peak != null ? 'range' : 'same' });
  }, [result.movementResults, onChange, weightedIndices]);

  // Get shared weight value and placeholder from first weighted movement
  const sharedWeight = isComplex && weightedIndices.length > 0
    ? movements[weightedIndices[0]]?.weight
    : undefined;
  const sharedPlaceholder = isComplex && weightedIndices.length > 0
    ? movements[weightedIndices[0]]?.movement.rxWeights?.male
    : undefined;
  // Label: use movement name when single weighted, "Barbell" for multi
  const progressiveLabel = weightedIndices.length === 1
    ? movements[weightedIndices[0]]?.movement.name ?? 'Weight'
    : 'Barbell';
  // Reps per set for "TOTAL REPS" badge
  const progressiveReps = weightedIndices.length > 0
    ? movements[weightedIndices[0]]?.movement.reps ?? result.exercise.suggestedReps
    : undefined;

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

  return (
    <>
      <div className={styles.container}>
        {isComplex && (
          <ProgressiveWeightRow
            weight={sharedWeight}
            placeholder={sharedPlaceholder}
            setsTotal={result.setsTotal}
            repsPerSet={progressiveReps}
            onChange={handleProgressiveChange}
            label={progressiveLabel}
          />
        )}
        {movements.map((mr, i) => {
          // Skip rendering weighted movements whose weight is already shown
          // in the ProgressiveWeightRow (avoids redundant row with no inputs)
          const isHandledByProgressive = isComplex && weightedIndices.includes(i);
          if (isHandledByProgressive && mr.kind === 'load') return null;

          return (
            <MovementRow
              key={mr.movementKey}
              mr={mr}
              index={i}
              hideWeight={isHandledByProgressive}
              onUpdate={(patch) => updateMovement(i, patch)}
              onSwapTap={hasAlternatives(mr.movement.name) || !!mr.movement.alternative
                ? () => setSwapOpenKey(mr.movementKey)
                : undefined}
            />
          );
        })}
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
  index: number;
  hideWeight?: boolean;
  onUpdate: (patch: Partial<MovementResult>) => void;
  onSwapTap?: () => void;
}

function MovementRow({ mr, hideWeight, onUpdate, onSwapTap }: MovementRowProps) {
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
        {mr.kind === 'load' && !hideWeight && <WeightInline mr={mr} onUpdate={onUpdate} />}
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
  const unitLabel = mr.implementCount === 2 ? '2× kg' : 'kg';
  const placeholder = mr.movement.rxWeights?.male ? String(mr.movement.rxWeights.male) : '0';

  return (
    <StepperInput
      value={mr.weight}
      onChange={(v) => onUpdate({ weight: v != null ? Math.max(0, v) : undefined })}
      step={getWeightStep(mr.movement.name, mr.implementCount)}
      min={0}
      max={500}
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
