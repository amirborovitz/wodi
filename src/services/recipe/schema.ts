/**
 * The form the AI fills in for one part — sent as an OpenAI strict structured output.
 *
 * Strict mode requires every property in `required` and `additionalProperties: false`, so an
 * optional field is a nullable one; `readRecipe` turns the nulls back into absences. The block is
 * recursive (`$defs.block` → items → block), which is what lets any nesting a board writes be
 * written down as it is.
 */

type JsonSchema = Record<string, unknown>;

const nullable = (schema: JsonSchema): JsonSchema => ({ anyOf: [schema, { type: 'null' }] });
const num: JsonSchema = { type: 'number' };
const int: JsonSchema = { type: 'integer' };
const str: JsonSchema = { type: 'string' };
const bool: JsonSchema = { type: 'boolean' };
const oneOf = (values: readonly string[]): JsonSchema => ({ type: 'string', enum: [...values] });
const obj = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const QUANTITY_KINDS = ['reps', 'calories', 'distance', 'seconds'] as const;
export const DISTANCE_UNITS = ['m', 'km', 'mi', 'yd', 'ft'] as const;
export const LOAD_UNITS = ['kg', 'lb'] as const;
export const EQUIPMENT = ['barbell', 'dumbbell', 'kettlebell', 'other', 'none'] as const;
export const PART_KINDS = ['warmup', 'skill', 'strength', 'metcon', 'accessory', 'cooldown'] as const;
export const ATHLETE_ANSWERS = ['time', 'rounds_and_reps', 'reps', 'weight', 'calories', 'distance', 'done'] as const;
export const SCORES = ['time', 'rounds', 'reps', 'load'] as const;
export const LOGGING_MODES = [
  'strength', 'for_time', 'amrap', 'amrap_intervals', 'intervals',
  'emom', 'cardio', 'cardio_distance', 'bodyweight', 'sets', 'free',
] as const;

const amount = obj({
  value: nullable(num),
  women: nullable(num),
  men: nullable(num),
  low: nullable(num),
  high: nullable(num),
  max: bool,
  start: nullable(num),
  step: nullable(num),
});

const movement = obj({
  name: str,
  kind: oneOf(QUANTITY_KINDS),
  amount,
  distanceUnit: nullable(oneOf(DISTANCE_UNITS)),
  equipment: oneOf(EQUIPMENT),
  load: nullable(obj({
    value: nullable(num),
    women: nullable(num),
    men: nullable(num),
    unit: oneOf(LOAD_UNITS),
    note: nullable(str),
  })),
  implements: nullable({ type: 'integer', enum: [1, 2] }),
  perSide: bool,
  shared: nullable(oneOf(['split', 'together'])),
  alternative: nullable(obj({ name: str, kind: oneOf(QUANTITY_KINDS), amount })),
});

export const RECIPE_RESPONSE_SCHEMA: JsonSchema = {
  $defs: {
    block: obj({
      repeat: nullable(int),
      repeatBy: oneOf(['board', 'athlete']),
      clock: nullable(str),
      label: nullable(str),
      score: nullable(oneOf(SCORES)),
      note: nullable(str),
      items: { type: 'array', items: { $ref: '#/$defs/item' } },
    }),
    item: obj({
      movement: nullable(movement),
      block: nullable({ $ref: '#/$defs/block' }),
    }),
  },
  ...obj({
    label: nullable(str),
    title: str,
    kind: oneOf(PART_KINDS),
    prescription: str,
    wodName: nullable(str),
    complex: bool,
    clock: nullable(str),
    logging: obj({
      mode: oneOf(LOGGING_MODES),
      score: nullable(oneOf(SCORES)),
      timeCapSeconds: nullable(num),
      intervalSeconds: nullable(num),
      intervalRestSeconds: nullable(num),
      intervalCount: nullable(int),
      workSeconds: nullable(num),
      difficulty: int,
      activeShare: nullable(num),
    }),
    teamSize: nullable(int),
    share: nullable(num),
    partnerNote: nullable(str),
    recipe: { $ref: '#/$defs/block' },
    totals: {
      type: 'array',
      items: obj({
        movement: str,
        kind: oneOf(QUANTITY_KINDS),
        value: nullable(num),
        women: nullable(num),
        men: nullable(num),
        dependsOnAthlete: bool,
        how: str,
      }),
    },
    asks: { type: 'array', items: obj({ question: str, answer: oneOf(ATHLETE_ANSWERS) }) },
  }),
};
