/**
 * Load units — one model for the whole app.
 *
 * TWO UNITS, KEPT APART. The board's unit is the coach's: "24/16 kg" is printed in kg, always.
 * The athlete's unit is what THEY lifted in: the board's unit by default, else the unit on their
 * profile (`User.weightUnit`), and whatever they said if they logged in the other one. It lives
 * on the movement as `loadUnit`, beside `loggedWeights`.
 *
 * Nothing is silently converted for display — a poster that turns 135 lb into 61.2 kg is showing
 * a number nobody wrote (poster truth standard), and a logging screen that labels 135 as "kg"
 * asks the athlete to confirm a lift they never did.
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

/** Anything carrying a load — the real `ParsedMovement` and the narrower shapes some call sites
 *  hand around both satisfy it, so no caller needs a cast. */
interface UnitBearer {
  rxWeights?: { unit?: LoadUnit; male?: number; female?: number };
  loadUnit?: LoadUnit;
}

/** Structural shape of anything that can state a load — ParsedExercise, Exercise, or a bare
 *  movement list. Kept structural so both the parse-time and the saved-doc types satisfy it. */
interface LoadUnitSource extends UnitBearer {
  movements?: ReadonlyArray<UnitBearer>;
  sections?: ReadonlyArray<{ movements: ReadonlyArray<UnitBearer> }>;
  buyIn?: ReadonlyArray<UnitBearer>;
  cashOut?: ReadonlyArray<UnitBearer>;
}

/** The board wrote a load for this movement ("24/16 kg") — and with it, a unit. */
export function boardStatesLoad(movement: UnitBearer | undefined): boolean {
  const rx = movement?.rxWeights;
  return !!rx && ((rx.male ?? 0) > 0 || (rx.female ?? 0) > 0);
}

/** The unit the COACH's Rx is written in. For printing the prescription, never the athlete's lift. */
export function rxLoadUnit(movement: UnitBearer | undefined): LoadUnit {
  return asLoadUnit(movement?.rxWeights?.unit);
}

/**
 * The athlete's unit when something actually says it — their own choice, or the board's written
 * load. Undefined is "nobody said": the chat asks rather than assume.
 */
export function knownLoadUnit(movement: UnitBearer | undefined): LoadUnit | undefined {
  if (movement?.loadUnit) return movement.loadUnit;
  return boardStatesLoad(movement) ? rxLoadUnit(movement) : undefined;
}

/** The unit ONE movement's athlete load is in: theirs, else the board's, else kg. */
export function movementLoadUnit(movement: UnitBearer | undefined): LoadUnit {
  return movement?.loadUnit ?? asLoadUnit(movement?.rxWeights?.unit);
}

/**
 * The unit an exercise's athlete loads are in. The first movement that actually states one
 * wins — boards mix a bare "Run" in among loaded movements, and a movement with no unit carries
 * no opinion. Mixed-unit parts are rare; the per-movement resolver is what the weight inputs and
 * poster rows use anyway.
 */
export function exerciseLoadUnit(exercise: LoadUnitSource | undefined): LoadUnit {
  if (!exercise) return 'kg';

  const stated = [
    ...(exercise.buyIn ?? []),
    ...(exercise.movements ?? []),
    ...(exercise.sections?.flatMap((section) => section.movements) ?? []),
    ...(exercise.cashOut ?? []),
  ].find((movement) => movement.loadUnit || movement.rxWeights?.unit);

  return stated ? movementLoadUnit(stated) : asLoadUnit(exercise.loadUnit ?? exercise.rxWeights?.unit);
}
