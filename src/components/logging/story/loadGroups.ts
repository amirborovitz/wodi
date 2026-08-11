import type { ParsedMovement } from '../../../types';
import type { MovementResult } from './types';

// Weight-input grouping bucket: same-bucket load movements share ONE weight input (the shared
// hero screen). 'other' is a load whose implement the coach never stated.
export type SharedEquipment = 'barbell' | 'kb' | 'db';
export type LoadEquipment = SharedEquipment | 'other';

// AI-stamped ParsedMovement.equipment → grouping bucket. The AI is the authority for the
// implement; the name regexes below are the fallback for docs parsed before the field existed.
// 'none' on a load-kind movement means the athlete added a load of their own choosing.
function equipmentFromAi(mov: ParsedMovement): LoadEquipment | null {
  switch (mov.equipment) {
    case 'barbell': return 'barbell';
    case 'dumbbell': return 'db';
    case 'kettlebell': return 'kb';
    case 'other':
    case 'none': return 'other';
    default: return null;
  }
}

function getEquipmentType(name: string): LoadEquipment {
  const lower = name.toLowerCase();
  if (/\bdb\b|dumbbell/.test(lower)) return 'db';
  if (/\bkb\b|kettlebell|\bsuitcase\b|\bfarmer'?s?\b|\bcarry\b/.test(lower)) return 'kb';
  if (isImplicitHeldLoad(lower)) return 'other';
  return 'barbell';
}

// Name-based classification, but a DOUBLE implement (twin/double DBs or KBs) can NEVER be a
// barbell — you can't hold two barbells — so it must resolve to DB/KB, not the barbell default.
// Defense for docs whose equipment field the AI/post-processor didn't stamp. General.
export function getMovementEquipmentType(mov: ParsedMovement): LoadEquipment {
  const named = getEquipmentType(mov.name);
  if (mov.implementCount === 2 && named === 'barbell') return 'db';
  return named;
}

// "Weighted X" with no stated implement (weighted box step-up, weighted pull-up, weighted
// sit-up) is a held load the athlete picks — DBs/KBs/plate — not necessarily the session's bar.
function isImplicitHeldLoad(name: string): boolean {
  return /\bweighted\b/i.test(name) && getExplicitEquipmentType(name) === null;
}

function getExplicitEquipmentType(name: string): SharedEquipment | null {
  const lower = name.toLowerCase();
  if (/\bdb\b|dumbbell/.test(lower)) return 'db';
  if (/\bkb\b|kettlebell/.test(lower)) return 'kb';
  if (/\bbarbell\b/.test(lower)) return 'barbell';
  return null;
}

/**
 * Resolve each load movement's implement, keyed by movementKey.
 *
 * AI-stamped equipment outranks every name heuristic. Below it, implicit held loads must not
 * adopt a sibling's explicit equipment either — a "Weighted Pull-up" next to a "Barbell Bench"
 * is not done with the barbell.
 */
export function resolveMovementEquipment(movements: MovementResult[]): Map<string, LoadEquipment> {
  const explicitTypes = new Set<SharedEquipment>();
  movements.forEach((mr) => {
    if (mr.kind !== 'load') return;
    const explicit = getExplicitEquipmentType(mr.movement.name);
    if (explicit) explicitTypes.add(explicit);
  });

  const sharedExplicitType = explicitTypes.size === 1 ? [...explicitTypes][0] : null;
  const byKey = new Map<string, LoadEquipment>();
  movements.forEach((mr) => {
    if (mr.kind !== 'load') return;
    byKey.set(
      mr.movementKey,
      equipmentFromAi(mr.movement)
        ?? getExplicitEquipmentType(mr.movement.name)
        ?? (isImplicitHeldLoad(mr.movement.name) ? 'other' : null)
        ?? sharedExplicitType
        ?? getMovementEquipmentType(mr.movement),
    );
  });
  return byKey;
}

export interface LoadGroup {
  type: SharedEquipment;
  movements: MovementResult[];
}

/**
 * Group the loaded movements by IMPLEMENT IN PLAY — not by equipment class.
 *
 * Movements whose implement the coach never stated ('other': "weighted box step-up",
 * "weighted pull-up", "weighted sit-up") join the exercise's implement when exactly one is in
 * play: in the gym that's the same DB/KB/bar the athlete already picked up for the movement
 * next to it, so the flow asks for ONE weight and offers "use different weights for each" as
 * the escape hatch. With zero, or two-plus, stated implements there is no telling which one
 * they held, so unstated loads stay their own tile and get asked individually.
 */
export function resolveLoadGroups(
  movements: MovementResult[],
  equipmentOf: (mr: MovementResult) => LoadEquipment,
): LoadGroup[] {
  const groups = new Map<SharedEquipment, LoadGroup>();
  const unstated: MovementResult[] = [];
  movements.forEach((mr) => {
    if (mr.kind !== 'load') return;
    const type = equipmentOf(mr);
    if (type === 'other') {
      unstated.push(mr);
      return;
    }
    const group = groups.get(type) ?? { type, movements: [] };
    group.movements.push(mr);
    groups.set(type, group);
  });

  const stated = [...groups.values()];
  if (stated.length !== 1 || unstated.length === 0) return stated;

  // Rebuild from `movements` so the merged group keeps board order — the hero caption reads in
  // the order the coach wrote them, whichever one carried the stated implement.
  const merged = new Set([...stated[0].movements, ...unstated].map(mr => mr.movementKey));
  return [{ type: stated[0].type, movements: movements.filter(mr => merged.has(mr.movementKey)) }];
}

/** One weight input's worth of movements, with a stable identity to key it by. */
export interface LoadBlock {
  key: string;
  type: LoadEquipment;
  movements: MovementResult[];
}

/**
 * Every DISTINCT load in a STRENGTH piece — one entry per weight the athlete has to state.
 *
 * Strength-only (`SupersetInput`). Metcon weights group by implement in play through
 * `resolveLoadGroups`, which this deliberately does not call: inside one metcon round a single
 * pair of DBs really does serve every DB movement, and that default must not change here.
 *
 * Two movements share ONE entry only when the AI flagged the exercise `complex` — an unbroken
 * sequence on a single bar ("1 Power Clean + 1 Hang Power Clean"), where there is literally one
 * load. Everything else is a station at its own intensity: "4 sets: 5 Shoulder press / 10/10 DB
 * row / 8/8 single leg deadlift" is three lifts, and sharing an equipment CLASS is not sharing a
 * weight — the row rides at 22.5 while the single-leg deadlift rides at 20. Inferring one number
 * from a shared 'db' bucket is what stamped a single load across that whole circuit.
 *
 * The `sectionIndex` axis still splits first: sequential blocks ("4 sets Push Press, Into: 4 sets
 * Push Jerk") are the same bar run at independent loads, so each keeps its own entry — and a
 * complex that repeats per block merges within its own block, never across them.
 *
 * Blocks come back in board order, each block's entries in the order the coach wrote them.
 */
export function resolveLoadBlocks(
  movements: MovementResult[],
  equipmentOf: (mr: MovementResult) => LoadEquipment,
  isComplex = false,
): LoadBlock[] {
  const byBlock = new Map<number, MovementResult[]>();
  movements.forEach((mr) => {
    if (mr.kind !== 'load') return;
    const blockIdx = mr.sectionIndex ?? -1;
    const list = byBlock.get(blockIdx) ?? [];
    list.push(mr);
    byBlock.set(blockIdx, list);
  });

  const blocks: LoadBlock[] = [];
  byBlock.forEach((loads, blockIdx) => {
    // One implement, never set down — the sub-lifts are one load and are asked once.
    //
    // The AI's word is taken as-is. Second-guessing it here with a shape heuristic ("same
    // equipment?", "same rep count?") only trades one wrong guess for another: three dumbbell
    // movements in a circuit pass an equipment check and merge just as wrongly. When `complex`
    // is wrong the answer is the prompt, not a UI override — see the openai.ts complex rule.
    // What makes trusting it SAFE is that the merge is never lossy: `SupersetInput` names every
    // movement the card covers and offers "Log these separately", so a bad call costs one tap
    // instead of making a lift impossible to record.
    if (isComplex && loads.length > 1) {
      blocks.push({ key: `${blockIdx}:complex`, type: equipmentOf(loads[0]), movements: loads });
      return;
    }
    loads.forEach((mr) => {
      blocks.push({ key: `${blockIdx}:${mr.movementKey}`, type: equipmentOf(mr), movements: [mr] });
    });
  });
  return blocks;
}
