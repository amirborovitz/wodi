/**
 * The FORM the AI fills in when it structures a board.
 *
 * This is sent as an OpenAI structured-output JSON Schema with `strict: true`, which changes the
 * nature of the parse contract: the fields here are not requests the prompt makes and the model
 * may miss in 27,000 words of instructions — they are slots the response is REJECTED without.
 *
 * Three things are structural here because prose rules could not hold them:
 *
 * 1. `equipment` is REQUIRED on every movement. The prompt already said "MUST" and the model
 *    still returned a Renegade Row with no implement, which fell through four name-based
 *    fallbacks to a hardcoded `return 'barbell'`. It can no longer be omitted.
 *
 * 2. `reps` accepts the literal "max". Previously "max reps" could only be said by OMITTING reps
 *    AND setting a separate isMaxReps flag — two coordinated actions, one of them an absence,
 *    against `reps: 1` which is one action and passes validation. The schema now makes the
 *    correct answer the cheaper one to write.
 *
 * 3. `perSide` exists at all. "6/6 Kettlebell Windmill" and "20/20m Suitcase Carry" had nowhere
 *    to record the second half, so every per-side movement logged at half its real volume.
 *
 * strict mode requires EVERY property to appear in `required` and every object to set
 * `additionalProperties: false`. Optional fields are therefore expressed as nullable unions and
 * normalised back to `undefined` in validateParsedWorkout.
 */

type JsonSchema = Record<string, unknown>;

/** A field the model may leave empty — strict mode has no optional properties, only nullable ones. */
const nullable = (schema: JsonSchema): JsonSchema => ({ anyOf: [schema, { type: 'null' }] });

const num = { type: 'number' } as const;
const str = { type: 'string' } as const;
const bool = { type: 'boolean' } as const;

const obj = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const rxPair = obj({
  male: nullable(num),
  female: nullable(num),
  unit: nullable({ type: 'string', enum: ['kg', 'lb'] }),
});

const rxCalories = obj({
  male: nullable(num),
  female: nullable(num),
});

/**
 * The quantity a movement carries. A number is a count the COACH wrote; "max" is a count the
 * ATHLETE earns. One field, one value — it cannot be half-expressed.
 */
const quantity = nullable({ anyOf: [num, { type: 'string', enum: ['max'] }] });

const alternative = obj({
  name: str,
  reps: nullable(num),
  distance: nullable(num),
  calories: nullable(num),
});

const movement = obj({
  name: str,

  // Quantity. Exactly one of these normally carries the work; "max" says the athlete earns it.
  reps: quantity,
  distance: quantity,
  calories: quantity,
  time: nullable(num),

  // The coach's own rep text when a RANGE was written ("10-12"), so the board's notation survives
  // the flattening into a single number.
  repsDisplay: nullable(str),

  // TRUE when the board writes the quantity PER SIDE ("6/6", "20/20m", "8 each arm"). The number
  // above stays the per-side value exactly as written; this says to double it for totals.
  perSide: nullable(bool),

  // REQUIRED. 'none' is a real answer (unweighted movement) — it is not the same as leaving this
  // blank, which is what sent Renegade Row to the barbell fallback.
  equipment: { type: 'string', enum: ['barbell', 'dumbbell', 'kettlebell', 'other', 'none'] },
  inputType: nullable({ type: 'string', enum: ['weight', 'calories', 'distance', 'none'] }),
  implementCount: nullable({ type: 'integer', enum: [1, 2] }),

  rxWeights: nullable(rxPair),
  rxCalories: nullable(rxCalories),
  unit: nullable(str),

  countingMode: nullable({
    type: 'string',
    enum: ['per_round', 'per_interval', 'per_station_visit', 'once'],
  }),
  scoreEntryMode: nullable({ type: 'string', enum: ['per_round', 'total'] }),
  perRound: nullable(bool),
  role: nullable({ type: 'string', enum: ['buy_in', 'cash_out'] }),

  occurrences: nullable({ type: 'integer' }),
  placement: nullable({ type: 'string', enum: ['between_sets'] }),
  stationLabel: nullable(str),
  stationIndex: nullable({ type: 'integer' }),

  together: nullable(bool),
  sharedLabel: nullable(str),
  relay: nullable(bool),

  alternative: nullable(alternative),
});

const section = obj({
  sectionType: { type: 'string', enum: ['buy_in', 'rounds', 'cash_out'] },
  rounds: nullable(num),
  label: nullable(str),
  scoreType: nullable({ type: 'string', enum: ['time', 'rounds', 'reps', 'load'] }),
  movements: { type: 'array', items: movement },
});

const exercise = obj({
  name: str,
  type: { type: 'string', enum: ['strength', 'cardio', 'skill', 'wod'] },
  prescription: str,

  // This block's OWN slice of the board — never a sibling's lines, never the whole photo.
  // The parts of a session are the highest level of the structure and must not blend.
  rawText: nullable(str),

  loggingMode: nullable({
    type: 'string',
    enum: [
      'strength', 'for_time', 'amrap', 'amrap_intervals', 'intervals',
      'emom', 'cardio', 'cardio_distance', 'bodyweight', 'sets', 'free',
    ],
  }),
  scoreType: nullable({ type: 'string', enum: ['time', 'rounds', 'reps', 'load'] }),

  suggestedSets: nullable(num),
  suggestedReps: nullable(num),
  suggestedRepsPerSet: nullable({ type: 'array', items: num }),
  ladderReps: nullable({ type: 'array', items: num }),
  rounds: nullable(num),
  rxWeights: nullable(rxPair),

  // The clock. A work/rest board ("EMOM (50:10)") must be able to say BOTH halves — with only
  // workDuration to write into, the 10-second rest had nowhere to go and vanished.
  intervalCount: nullable(num),
  workDuration: nullable(num),
  restDuration: nullable(num),

  stationRotation: nullable(bool),
  isSecondary: nullable(bool),
  complex: nullable(bool),
  partnerWorkout: nullable(bool),
  partnerSplit: nullable({ type: 'string', enum: ['rounds', 'reps'] }),
  aiPartName: nullable(str),

  movements: { type: 'array', items: movement },
  sections: nullable({ type: 'array', items: section }),
  buyIn: nullable({ type: 'array', items: movement }),
  cashOut: nullable({ type: 'array', items: movement }),
});

const workout = obj({
  title: str,
  type: { type: 'string', enum: ['strength', 'metcon', 'emom', 'amrap', 'for_time', 'mixed'] },
  format: {
    type: 'string',
    enum: ['for_time', 'intervals', 'amrap', 'amrap_intervals', 'emom', 'strength', 'tabata'],
  },
  scoreType: {
    type: 'string',
    enum: ['time', 'time_per_set', 'rounds_reps', 'load', 'reps', 'pass_fail'],
  },
  difficultyLevel: nullable({ type: 'integer' }),
  timeCap: nullable(num),
  sets: nullable(num),
  intervalTime: nullable(num),
  rawText: nullable(str),
  sourceDate: nullable(str),
  partnerWorkout: nullable(bool),
  teamSize: nullable(num),
  stationRotation: nullable(bool),
  exercises: { type: 'array', items: exercise },
});

export const PARSE_RESPONSE_SCHEMA = {
  name: 'parsed_workout',
  strict: true,
  schema: workout,
} as const;
