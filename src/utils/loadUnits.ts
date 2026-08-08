/**
 * Load units — one model for the whole app.
 *
 * THE BOARD'S UNIT IS THE TRUTH. A coach who wrote "135 lb" gets logged in lb, saved as 135
 * with `unit: 'lb'`, and printed on the poster as "135lb". Nothing is silently converted for
 * display — a poster that turns 135 lb into 61.2 kg is showing a number nobody wrote (poster
 * truth standard), and a logging screen that labels 135 as "kg" asks the athlete to confirm
 * a lift they never did.
 *
 * Conversion happens in exactly ONE place: the kg-denominated math boundary. `totalVolume` /
 * EP divide by the athlete's bodyweight in kg, so an lb load must become kg before it lands
 * in a volume sum — otherwise an lb gym's EP runs ~2.2x hot. Use `toKg()` there and nowhere
 * else.
 */

export type LoadUnit = 'kg' | 'lb';

const LB_PER_KG = 2.20462;

/**
 * A load expressed in kg, whatever unit it was written in. The ONLY lb→kg arithmetic in the
 * app — call it when feeding volume/bodyweight math, never when building display text.
 */
export function toKg(value: number, unit: LoadUnit | undefined): number {
  return unit === 'lb' ? value / LB_PER_KG : value;
}

/** Narrow an untrusted/optional unit string to a LoadUnit. Anything not 'lb' is kg. */
export function asLoadUnit(unit: string | undefined): LoadUnit {
  return unit === 'lb' ? 'lb' : 'kg';
}

/** Anything carrying a prescribed load — the real `RxWeights` and the narrower shapes some
 *  call sites hand around both satisfy it, so no caller needs a cast. */
interface UnitBearer {
  rxWeights?: { unit?: LoadUnit };
}

/** Structural shape of anything that can state a prescribed load — ParsedExercise, Exercise,
 *  or a bare movement list. Kept structural so both the parse-time and the saved-doc types
 *  satisfy it without a cast. */
interface LoadUnitSource extends UnitBearer {
  movements?: ReadonlyArray<UnitBearer>;
  sections?: ReadonlyArray<{ movements: ReadonlyArray<UnitBearer> }>;
  buyIn?: ReadonlyArray<UnitBearer>;
  cashOut?: ReadonlyArray<UnitBearer>;
}

/** The unit ONE movement's load is written in. */
export function movementLoadUnit(movement: UnitBearer | undefined): LoadUnit {
  return asLoadUnit(movement?.rxWeights?.unit);
}

/**
 * The unit an exercise's loads are written in. The first movement that actually states one
 * wins — boards mix a bare "Run" in among loaded movements, and a movement with no rxWeights
 * carries no opinion about the unit. Mixed-unit boards don't exist in practice; if one ever
 * shows up, the per-movement resolver is what the weight inputs and poster rows use anyway.
 */
export function exerciseLoadUnit(exercise: LoadUnitSource | undefined): LoadUnit {
  if (!exercise) return 'kg';

  const stated = [
    ...(exercise.buyIn ?? []),
    ...(exercise.movements ?? []),
    ...(exercise.sections?.flatMap((section) => section.movements) ?? []),
    ...(exercise.cashOut ?? []),
  ].find((movement) => movement.rxWeights?.unit);

  return asLoadUnit(stated?.rxWeights?.unit ?? exercise.rxWeights?.unit);
}
