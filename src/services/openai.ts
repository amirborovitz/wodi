import { completeParse, type ParsePart } from './parseModel';
import type { ParsedWorkout, ParsedExercise, WorkoutPartKind } from '../types';
import { resolveSourceDate } from './sourceDateResolution';
import { athleteContextBlock, recipeRequestParts, type RecipeContext } from './recipe/request';
import { RECIPE_RESPONSE_SCHEMA } from './recipe/schema';
import { readRecipe } from './recipe/readRecipe';
import { crossCheckTotals, type TotalsDisagreement } from './recipe/totals';
import { recipeToParsedWorkout } from './recipe/toParsedWorkout';
import type { PartRecipe } from './recipe/types';
import { recordTotalsOverruled } from './parseAudit';

/**
 * The model that reads every workout — the photo, then each part's structure. One place, so a
 * swap or a rollback is a one-line change.
 *
 * gpt-4o (2024) until 12 Sep 2026, when it read a board's "AK swing" as "Alternating Kettlebell
 * Swing" — shorthand a current model reads as American. gpt-5.5 is a reasoning model and takes
 * different request settings: `max_completion_tokens` instead of `max_tokens`, and temperature 0
 * only with reasoning off. Reasoning stays OFF so the same board keeps giving the same answer
 * (see the temperature note on the structuring call); turning it up is the first thing to measure
 * once there is a photo corpus to measure it against.
 */
export const PARSE_MODEL = 'gpt-5.5';
export const PARSE_REASONING_EFFORT = 'none' as const;


/**
 * The parse hit OpenAI's rate limit (429), not a workout the parser couldn't read.
 * Thrown so the UI can say "wait a couple of minutes" instead of blaming the board —
 * a rate limit clears on its own, so re-shooting or rewording the WOD does nothing.
 */
export class ParseRateLimitError extends Error {
  constructor(cause?: unknown) {
    super('OpenAI rate limit reached while parsing the workout.');
    this.name = 'ParseRateLimitError';
    this.cause = cause;
  }
}

function errorFields(error: unknown): { status?: unknown; statusCode?: unknown; code?: unknown; message: string } {
  const candidate = (error && typeof error === 'object' ? error : {}) as {
    status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown;
  };
  return { ...candidate, message: typeof candidate.message === 'string' ? candidate.message : '' };
}

/**
 * The athlete used up today's AI calls (the wodiModel function's per-athlete limit). It arrives as a
 * 429, but waiting minutes won't clear it — it resets tomorrow.
 */
export function isDailyLimitError(error: unknown): boolean {
  return errorFields(error).code === 'wodi_daily_limit';
}

/**
 * The API key is out of credit. OpenAI returns this as a 429 too, but unlike a rate limit it
 * never clears on its own — so it must never be reported as "try again in a few minutes".
 */
export function isQuotaExhaustedError(error: unknown): boolean {
  const { code, message } = errorFields(error);
  return code === 'insufficient_quota' || /insufficient[_ ]quota|exceeded your current quota/i.test(message);
}

/** True for OpenAI 429s, however they surface (SDK APIError, fetch Response, or bare message). */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof ParseRateLimitError) return true;
  if (!error || typeof error !== 'object' || isDailyLimitError(error)) return false;
  const { status, statusCode, code, message } = errorFields(error);
  if (status === 429 || statusCode === 429) return true;
  if (code === 'rate_limit_exceeded') return true;
  return /\b429\b|rate limit/i.test(message);
}

// Canonical names, applied once — by the segmentation, which writes every part's text in them.
const MOVEMENT_ALIASES_SECTION = `## MOVEMENT ALIASES (use canonical names)
Barbell: s2oh/stoh → Shoulder to Overhead, dl → Deadlift, bs → Back Squat, fs → Front Squat, pc → Power Clean, sqcl → Squat Clean, ps → Power Snatch, ohs → Overhead Squat, c&j → Clean and Jerk
Gymnastics: hspu → Handstand Push-up, t2b/ttb → Toes to Bar, k2e → Knees to Elbow, mu → Muscle-up, bmu/b.m.u → Bar Muscle-up, rmu → Ring Muscle-up, c2b → Chest to Bar Pull-up, hs walk → Handstand Walk
Cardio: du → Double Under, su → Single Under, cal → Calories
Equipment: kb → Kettlebell, db → Dumbbell, bb → Barbell, wb → Wall Ball
CRITICAL: Compound movements written as "X to Y" or "X + Y" (e.g., "Power Clean to Push Press", "Hang Clean to Overhead", "Deadlift to Hang Power Clean") are a SINGLE movement. Preserve the FULL compound name — do NOT simplify to just the first movement ("Power Clean to Push Press" is NOT "Power Clean").
CRITICAL: Preserve movement modifiers such as Goblet, Front Rack, Overhead, Walking, Alternating/Alt. "20 goblet alt lunges" → "Goblet Alt Lunge", not plain "Lunge".
CRITICAL: A rep-style qualifier (t&g/tng → Touch-and-Go, ub → Unbroken) describes HOW the reps are done, not a second movement — keep it as a prefix on the one movement it modifies. "8 T&G Power Cleans" → "Touch-and-Go Power Clean", NEVER "Touch + Power Clean" (that reads as the "X + Y compound movement" pattern above, which this is not).
CRITICAL: Movement names are SINGULAR — they name the movement, not a count of it. "20 x squats" → "Back Squat", "15 pull ups" → "Pull-up", "50 double unders" → "Double Under". Boards write plurals; a canonical name never does.
CRITICAL: A bare root ("squat", "press", "row", "snatch") is not a lift name — resolve it to the lift the LOAD implies. Barbell-loaded "squats" → Back Squat; unloaded → Air Squat. A barbell "press" written on its own → Strict Press. Resolve only what the board actually shows: if nothing on the board says how it is loaded, leave the bare word as written rather than guessing an implement.`;


// Banner around every verbatim AI response in the console. Filter devtools on "AI-RAW" to see
// exactly what the model returned for a log, stage 1 and stage 2, and nothing else.
const AI_RAW_RULE = '═'.repeat(60);

export async function parseWorkoutImage(base64Image: string): Promise<ParsedWorkout> {
  try {
    const startedAt = performance.now();
    const segmented = await segmentWorkoutImage(base64Image);
    console.info(`[TIMING] transcribe+segment: ${Math.round(performance.now() - startedAt)}ms`);
    if (!segmented) {
      throw new Error('Could not parse workout from image');
    }
    // The board's text is the segmented parts themselves — stage 1 transcribes and splits in one
    // read, so there is no separate verbatim transcription to fall back on.
    const boardText = segmented.parts.map((part) => part.text).join('\n\n');
    return await structureSegments(boardText, segmented, 'IMAGE');
  } catch (error) {
    console.error('Error parsing workout image:', error);
    throw error;
  }
}

// ─── Stage 1: read + normalize + segment ─────────────────────────────────────
// One small prompt with one job: produce the session's CLEANED text (canonical movement names,
// expanded shorthand) split into its standalone parts. For images this same call also does the
// transcription — reading pixels pairs safely with line-grouping because neither requires
// interpretation; it was the huge STRUCTURING prompt that caused dropped lines when combined
// with OCR. Structure interpretation happens AFTERWARD, once per part — so no session-level
// reading can leak into a sibling part, and the structuring prompt never has to juggle
// multi-part bookkeeping.

const PART_KINDS: readonly WorkoutPartKind[] = ['warmup', 'skill', 'strength', 'metcon', 'accessory', 'cooldown'];

/** The training itself — everything but the warm-up and the cool-down around it. */
const isTrainingPart = (kind: WorkoutPartKind): boolean => kind !== 'warmup' && kind !== 'cooldown';

/** The piece the athlete trains for: the strength and the WOD. Every other section supports it. */
const isMainPartKind = (kind: WorkoutPartKind): boolean => kind === 'strength' || kind === 'metcon';

export interface WorkoutPartSegment {
  label?: string;
  kind: WorkoutPartKind;
  text: string;
}

export interface SegmentedWorkout {
  title?: string;
  parts: WorkoutPartSegment[];
}

const SEGMENT_SPEC = `Return ONLY valid JSON:
{
  "title": "the session's own name if one is written on the board, else omit — see TITLE below",
  "parts": [
    { "label": "A", "kind": "warmup" | "skill" | "strength" | "metcon" | "accessory" | "cooldown", "text": "the part's lines, cleaned, newline-separated" }
  ]
}

NORMALIZATION (apply inside each part's text):
- Replace shorthand/abbreviations with canonical movement names. Fix obvious typos and OCR noise.
- PRESERVE everything else exactly: every line, every quantity (reps, weights, distances, calories, times, percentages), line order, round markers ("x 6", "(alt')", "21-15-9"), and coach notes. Never merge, reorder, summarize, or drop a line — even a short line repeating an earlier one.

${MOVEMENT_ALIASES_SECTION}

TITLE:
- Only a name the board gives the SESSION. A heading or chrome is not a title: "WOD", "Workout of the Day", "Metcon", "Today", a date, a gym or app name, a screen header above the board, a nav bar. Omit it in those cases and let each part speak for itself.
- A name written over ONE part ("Running GRACE" above part C) is that part's name, not the session's — leave it inside that part's text and omit the title.

SEGMENTATION:
- A session has 1-3+ parts, usually labeled (A./B./C.) or separated by headers (STRENGTH, METCON, WOD, Cool Down). Every input line belongs to EXACTLY ONE part.
- The unit of a part is the SECTION OF THE CLASS (the "kind" list below), never the label. Before splitting on A./B./C. labels, check what governs the labeled blocks:
  - A section header written ONCE above them ("Metcon", "WOD", "Conditioning") makes them that ONE section — ONE part, with the internal labels kept inside its text — even when every block carries its own format line. Example: "Metcon / A. 6 RFT: [...] / B. 6 RFT: [...]" is ONE metcon part.
  - A format/scoring header written ONCE above them ("For time:", "AMRAP 25", "Chipper") and/or a single time cap written once below covering all of them means the blocks run on ONE clock toward ONE score — ONE part. The same holds for blocks joined by connectors ("Into:", "then", "A+B+C for time") and for a partner piece with one finish time. Example: "For time: / A. 10 rounds: [...] / B. 10 rounds: [...] / C. 10 rounds: [...] / 40 min T.C." is ONE metcon part.
- Labels split into separate parts only when nothing written once governs them AND each labeled block is SEPARATELY LETTERED (its own A./B./C.) AND scored on its own — it carries its own format/scoring line ("A. Every 1:30 x 8: ...", "B. 16 min AMRAP: ..."), its own clock or time cap, or is a different kind of training. Different sections of the class (strength, then the metcon) are always separate parts. Blocks scored independently are separate parts even when unlabeled.
- Work done IN BETWEEN another block's sets ("In between sets: 3 x 15 band pull-aparts", "In between, 3 sets of: …") is part of THAT block — it happens in the gaps of those sets, so it stays inside the block's part, never a part of its own, even when it carries its own "N sets of" line.
- A per-block cadence/scheme line alone does NOT promote a sub-block to its own part. What binds sub-blocks into ONE part is a SHARED GOVERNING SCOPE: they sit under a single top-level label (one "A."), or under one scoring header / one time cap. Sub-bullets or lines within that scope stay ONE part even when each repeats its own cadence/scheme line — and whether or not a connector ("Into:", "then", "immediately into") joins them. The connector is a hint, not the trigger; the trigger is the shared scope. Contrast: "A. 4 sets Every 1:30: 2 Push Press / Into: / 4 sets Every 1:30: 2 Push Jerk" is ONE strength part (both bullets share the single label A.) — do NOT split it into Push Press and Push Jerk parts; whereas "A. Every 1:30 x 8: [...] / B. 16 min AMRAP: [...]" is TWO parts (two separate top-level letters, each with its own scoring).
- "kind" per part: which section of a CrossFit class it is — "warmup", "skill", "strength", "metcon", "accessory" or "cooldown". Exactly one per part, as a coach would name it.
- A footnote or shared note (e.g. "* Two groups, starting at different stations") belongs to the part it modifies — keep it inside that part's text.
- A date written on the board goes into the FIRST part's text (a later step reads it from there).
- Single-part boards return one part. Never invent parts that are not on the board.

If the input is not a workout, return: {"error": "Could not parse workout"}`;

const WORKOUT_SEGMENT_PROMPT = `You are a CrossFit session editor. You receive the raw transcription of a gym whiteboard and return it CLEANED and SPLIT INTO PARTS as JSON. You do NOT interpret structure (rounds, scoring, logging) — a later step does that per part.

${SEGMENT_SPEC}`;

const IMAGE_SEGMENT_PROMPT = `You are a CrossFit session editor. Read the workout whiteboard/photo and return its text TRANSCRIBED, CLEANED and SPLIT INTO PARTS as JSON. You do NOT interpret structure (rounds, scoring, logging) — a later step does that per part.

TRANSCRIPTION (do this first — fidelity is the whole job):
- Transcribe every piece of visible text exactly as written — title, date, section labels, all movements, reps, weights, and numbers — preserving line breaks and order.
- Include every line, even a short line that repeats one you already transcribed (e.g. a connector like "200m run" appearing multiple times, once before each of several movements).
- A period inside an abbreviation (S.T.O.H., D.U., T.T.B., K.B.S., A.M.R.A.P.) is NOT a line or sentence terminator — do not let it cause you to skip or merge the line that follows it. The single most commonly dropped line is a short repeating connector immediately before the LAST movement in a round — verify that exact position.
- Before answering, recount the visible lines in the image and verify every one of them appears in exactly one part.
- A board in another language or script: name each movement by what ITS OWN WORDS say, word for word — never by which movement usually comes next in a workout like this. A word you cannot make out with confidence stays in its original script, exactly as you see it, for the next step to ask about; a plausible-looking guess is a wrong movement the athlete logs.

${SEGMENT_SPEC}`;

// 'not_workout' = the model explicitly said the input isn't a workout (don't bother retrying);
// 'invalid' = malformed/empty response (a retry may succeed).
type SegmentationOutcome = SegmentedWorkout | 'not_workout' | 'invalid';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

export function validateSegmentedWorkout(data: unknown): SegmentationOutcome {
  const root = asRecord(data);
  if (!root) return 'invalid';
  if (typeof root.error === 'string') return 'not_workout';
  const allParts = (Array.isArray(root.parts) ? root.parts : []).filter((entry) => asRecord(entry));
  const kindOf = (entry: unknown): WorkoutPartKind => {
    const kind = asRecord(entry)?.kind;
    return PART_KINDS.find((k) => k === kind) ?? 'metcon';
  };
  // Wodi logs the training, not the class around it: a warm-up, mobility or cool-down is never
  // asked about, postered or counted. A board that is nothing BUT one is still what they did.
  const aroundTheClass = (entry: unknown): boolean => !isTrainingPart(kindOf(entry));
  const rawParts = allParts.every(aroundTheClass) ? allParts : allParts.filter((entry) => !aroundTheClass(entry));
  const parts = rawParts.flatMap((entry): WorkoutPartSegment[] => {
    const part = asRecord(entry);
    if (!part || typeof part.text !== 'string' || part.text.trim().length === 0) return [];
    const kind = kindOf(entry);
    return [{
      ...(typeof part.label === 'string' && part.label.trim() ? { label: part.label.trim() } : {}),
      kind,
      text: part.text.trim(),
    }];
  });
  if (parts.length === 0) return 'invalid';
  return {
    ...(typeof root.title === 'string' && root.title.trim() ? { title: root.title.trim() } : {}),
    parts,
  };
}

async function requestSegmentation(content: ParsePart[]): Promise<SegmentationOutcome> {
  const response = await completeParse({ parts: content, maxOutputTokens: 1500, cacheKey: 'wodi-segment' });

  const raw = response.text;
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = (jsonMatch ? jsonMatch[1] : raw).trim();
  // Stage 1 output verbatim — the transcribed + cleaned board text, before any validation drops a part.
  console.info(
    `\n${AI_RAW_RULE}\n🤖 AI-RAW · STAGE 1 TRANSCRIBE + SEGMENT\n${AI_RAW_RULE}\n`
    + `${jsonStr}\n${AI_RAW_RULE}`,
  );
  try {
    return validateSegmentedWorkout(JSON.parse(jsonStr));
  } catch {
    return 'invalid';
  }
}

/**
 * Split a board into its sections — the one way in for a photo and for typed words alike, so
 * every part of every log belongs to a section. One retry on malformed output only: a "this
 * isn't a workout" verdict is final, and a rate limit is surfaced, never read as a bad board.
 */
async function segmentWorkout(content: ParsePart[]): Promise<SegmentedWorkout | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const outcome = await requestSegmentation(content).catch((error): SegmentationOutcome => {
      if (isRateLimitError(error)) throw new ParseRateLimitError(error);
      return 'invalid';
    });
    if (typeof outcome === 'object') return outcome;
    if (outcome === 'not_workout') return null;
    console.warn(`[SEGMENT] segmentation attempt ${attempt + 1} returned invalid JSON`);
  }
  return null;
}

function segmentWorkoutText(text: string, athleteNote?: string): Promise<SegmentedWorkout | null> {
  return segmentWorkout([
    { type: 'text', text: WORKOUT_SEGMENT_PROMPT },
    { type: 'text', text: `Here is the transcribed workout text:\n\n${text}` },
    ...(athleteNote ? [athleteContextBlock(athleteNote)] : []),
  ]);
}

function segmentWorkoutImage(base64Image: string): Promise<SegmentedWorkout | null> {
  return segmentWorkout([
    { type: 'text', text: IMAGE_SEGMENT_PROMPT },
    { type: 'image', mimeType: 'image/jpeg', base64: base64Image },
  ]);
}

// ─── Stage 3: structure each part independently, then merge ──────────────────
// Each part is a STANDALONE practice: it gets its own structuring call over its own text, so
// there is exactly one authoritative reading of each part and no session-level field can
// redefine a sibling. Session-level fields on the merged result describe the primary part.

function mergeSegmentedParses(
  originalText: string,
  segmented: SegmentedWorkout,
  partParses: ParsedWorkout[],
): ParsedWorkout {
  // Primary = the part the poster leads with, whose session-level fields (format, scoreType…)
  // describe the merged workout. A part can be segmented as 'metcon' yet contain only
  // isSecondary exercises (the AI marks a skill-practice EMOM secondary) — its format must not
  // become the session format over the real main metcon's.
  const isMainPart = (index: number): boolean =>
    partParses[index].exercises.some((exercise) => exercise.isSecondary !== true);
  const primaryIndex = (() => {
    const mainMetcon = segmented.parts.findIndex((part, index) => part.kind === 'metcon' && isMainPart(index));
    if (mainMetcon >= 0) return mainMetcon;
    const anyMetcon = segmented.parts.findIndex((part) => part.kind === 'metcon');
    return anyMetcon >= 0 ? anyMetcon : 0;
  })();
  const primary = partParses[primaryIndex];

  const exercises: ParsedExercise[] = partParses.flatMap((parse, index) => {
    const part = segmented.parts[index];
    return parse.exercises.map((exercise) => ({
      ...exercise,
      rawText: exercise.rawText || part.text,
      // Kept so this part can later be re-parsed ALONE under the same prompt scope it was
      // first read with — the athlete's "Fix this part" never re-reads its siblings.
      partKind: part.kind,
      ...(isMainPartKind(part.kind) ? {} : { isSecondary: true }),
    }));
  });

  const firstDefined = <K extends keyof ParsedWorkout>(key: K): ParsedWorkout[K] =>
    primary[key] ?? partParses.find((parse) => parse[key] != null)?.[key] as ParsedWorkout[K];

  return {
    ...primary,
    title: segmented.title || primary.title,
    rawText: originalText,
    exercises,
    teamSize: firstDefined('teamSize'),
    // A session is a partner session when ANY part is partnered. firstDefined alone gets this
    // wrong: the primary (first metcon) part may be a solo sibling whose post-processed
    // explicit `false` would win over another part's `true` (?? only skips null/undefined).
    partnerWorkout: partParses.some((parse) => parse.partnerWorkout === true)
      ? true
      : firstDefined('partnerWorkout'),
    sourceDate: resolveSourceDate(firstDefined('sourceDate'), originalText, new Date()),
  };
}

/**
 * Full text→workout pipeline: segment the session into standalone parts, structure each part
 * with its own AI call (in parallel), and merge. The same split a photo goes through, so a typed
 * workout's parts belong to sections too — and its warm-up is dropped the same way.
 */
export async function parseWorkoutSession(
  text: string,
  sourceLabel: 'TEXT' | 'IMAGE' = 'TEXT',
  athleteNote?: string,
): Promise<ParsedWorkout> {
  const segmented = await segmentWorkoutText(text, athleteNote);
  if (!segmented) throw new Error('Could not parse workout from text');
  return withUserContext(await structureSegments(text, segmented, sourceLabel, athleteNote), athleteNote);
}

// Stamps the athlete's note on the parse so it persists with the workout and future
// re-parses can include the full correction history.
function withUserContext(parsed: ParsedWorkout, athleteNote?: string): ParsedWorkout {
  return athleteNote ? { ...parsed, userContext: athleteNote } : parsed;
}

/**
 * Re-read ONE part of a board with the athlete's correction, leaving every other part untouched.
 *
 * This is the whole correction channel. It deliberately does NOT go through
 * `parseWorkoutSession`: segmenting again would re-read the entire board, and the parse is
 * non-deterministic — so a note about the metcon could silently reshape a strength part the
 * athlete never complained about, discarding numbers they already logged correctly. Re-parsing
 * one part is also one call on the cheaper kind-scoped prompt instead of segment + N.
 *
 * `partText` is the exercise's own `rawText` (its slice of the board, preserved through the
 * merge) and `kind` is its `partKind` — both persisted on the saved workout for exactly this.
 * Callers splice the result back with `applyPartReparse`.
 */
export async function reparseWorkoutPart(
  partText: string,
  kind: WorkoutPartKind | undefined,
  athleteNote: string,
): Promise<ParsedWorkout> {
  const parsed = await readPart(partText, 'TEXT', { athleteNote });
  return withUserContext(
    // The re-parse sees only this part's text, so its exercises come back without the scope
    // stamp the merge would normally apply. Restore it, or a second correction on the same
    // part would have nothing to re-parse with.
    { ...parsed, exercises: parsed.exercises.map((exercise) => ({ ...exercise, partKind: kind })) },
    athleteNote,
  );
}

async function structureSegments(
  originalText: string,
  segmented: SegmentedWorkout,
  sourceLabel: 'TEXT' | 'IMAGE',
  athleteNote?: string,
): Promise<ParsedWorkout> {
  console.info('[SEGMENT]', {
    title: segmented.title,
    parts: segmented.parts.map((part) => `${part.label ?? '?'} ${part.kind} (${part.text.split('\n').length} lines)`),
  });

  if (segmented.parts.length === 1) {
    const part = segmented.parts[0];
    const parsed = await structurePart(part, sourceLabel, athleteNote, segmented.title);
    return {
      ...parsed,
      rawText: originalText,
      // Single-part boards get the same stamp as merged ones — a one-part session must be
      // just as re-parseable as one part of a three-part session.
      exercises: parsed.exercises.map((exercise) => ({ ...exercise, partKind: part.kind })),
      ...(segmented.title ? { title: segmented.title } : {}),
    };
  }

  // Parallel: kind-scoped prompts (see buildParsePrompt) keep a multi-part burst inside the
  // per-minute token limit that used to force this loop sequential, and structurePart's retry
  // ladder absorbs 429 stragglers. A 429 that outlives the ladder rejects this Promise.all
  // rather than degrading — losing a part's structure silently is worse than asking the
  // athlete to re-shoot the same board in a couple of minutes.
  const startedAt = performance.now();
  const partParses = await Promise.all(
    segmented.parts.map((part) => structurePart(part, sourceLabel, athleteNote, segmented.title)),
  );
  console.info(`[TIMING] structured ${segmented.parts.length} parts in parallel: ${Math.round(performance.now() - startedAt)}ms`);
  return mergeSegmentedParses(originalText, segmented, partParses);
}

// ─── Reading one part as a recipe ────────────────────────────────────────────
// The AI describes the part as it is written (nested repeats, both columns of every pair) and
// states its own totals. The app multiplies the recipe; the AI's totals check that arithmetic.
// See services/recipe/types.ts.

const RECIPE_SCHEMA = { name: 'part_recipe', strict: true, schema: RECIPE_RESPONSE_SCHEMA };

async function requestRecipe(
  text: string,
  sourceLabel: 'TEXT' | 'IMAGE',
  context: RecipeContext,
  recheck?: TotalsDisagreement[],
): Promise<PartRecipe> {
  const startedAt = performance.now();
  const response = await completeParse({
    parts: recipeRequestParts(text, context, recheck),
    schema: RECIPE_SCHEMA,
    maxOutputTokens: 8192,
    cacheKey: 'wodi-recipe',
  });
  console.info(`[TIMING] recipe${recheck ? ' (recheck)' : ''}: ${Math.round(performance.now() - startedAt)}ms`);
  const raw = response.text.trim();
  console.info(`\n${AI_RAW_RULE}\n🤖 AI-RAW · RECIPE · ${sourceLabel}${recheck ? ' · RECHECK' : ''}\n${AI_RAW_RULE}\n${raw}\n${AI_RAW_RULE}`);
  return readRecipe(JSON.parse(raw));
}

/**
 * The AI's recipe for one part, checked against its own totals. A disagreement is read once more
 * with the mismatch pointed out; one that survives keeps the recipe's arithmetic — the model reads
 * structure reliably and adds unreliably — and is flagged for review, never shown to the athlete.
 */
async function readPartRecipe(
  text: string,
  sourceLabel: 'TEXT' | 'IMAGE',
  context: RecipeContext,
): Promise<PartRecipe> {
  const first = await requestRecipe(text, sourceLabel, context);
  const firstIssues = crossCheckTotals(first);
  if (firstIssues.length === 0) return first;
  console.warn('[RECIPE] totals disagree with the recipe — reading again', firstIssues);
  const second = await requestRecipe(text, sourceLabel, context, firstIssues).catch((error: unknown) => {
    if (isRateLimitError(error)) throw error;
    console.warn('[RECIPE] recheck failed — keeping the first reading', error);
    return undefined;
  });
  const kept = second ?? first;
  const issues = second ? crossCheckTotals(second) : firstIssues;
  if (issues.length === 0) return kept;
  console.warn('[RECIPE] totals still disagree — keeping the recipe\'s arithmetic, flagged for review', issues);
  recordTotalsOverruled(issues);
  return { ...kept, unresolvedTotals: issues };
}

/** One part, read as a recipe and translated for today's logging screens. */
async function readPart(
  text: string,
  sourceLabel: 'TEXT' | 'IMAGE',
  context: RecipeContext,
): Promise<ParsedWorkout> {
  const recipe = await readPartRecipe(text, sourceLabel, context);
  const parsed = recipeToParsedWorkout(recipe, text);
  return {
    ...parsed,
    sourceDate: resolveSourceDate(undefined, text, new Date()),
    ...(context.athleteNote ? { userContext: context.athleteNote } : {}),
  };
}

// Structures one segmented part, retrying failures before demoting to 'free' (a parseable
// part must never end up as a bare score screen because of a transient error). Rate limits
// are the exception: they never demote, they throw — see the catch below. The second
// delay is long on purpose: multi-part sessions fire several full-prompt calls back to back,
// and OpenAI's tokens-per-MINUTE limit doesn't clear in 2 seconds — a short retry lands in
// the same window and fails identically. An empty parse (possible stochastic refusal) gets
// one more chance; a second empty is a real refusal (e.g. a cool-down blurb) and degrades.
const STRUCTURE_RETRY_DELAYS_MS = [2_000, 20_000];

async function structurePart(
  part: WorkoutPartSegment,
  sourceLabel: 'TEXT' | 'IMAGE',
  athleteNote?: string,
  sessionTitle?: string,
): Promise<ParsedWorkout> {
  const label = part.label ?? '?';
  for (let attempt = 0; attempt <= STRUCTURE_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const parsed = await readPart(part.text, sourceLabel, { athleteNote, sessionTitle });
      if (parsed.exercises.some((exercise) => (exercise.movements?.length ?? 0) > 0)) return parsed;
      if (attempt >= 1) {
        console.warn(`[SEGMENT] part ${label} structured empty twice — keeping it as a free part`);
        return buildFreePartFallback(part);
      }
      console.warn(`[SEGMENT] part ${label} structured empty — retrying once`);
    } catch (error) {
      if (attempt >= STRUCTURE_RETRY_DELAYS_MS.length) {
        // A rate limit is not an unreadable board — degrading here would hand the athlete a
        // bare score screen and silently lose the part's structure forever. Surface it so the
        // UI can tell them to wait it out and re-parse the same photo.
        if (isRateLimitError(error)) {
          console.warn(`[SEGMENT] part ${label} rate-limited after ${attempt + 1} attempts — failing the parse:`, error);
          throw new ParseRateLimitError(error);
        }
        console.warn(`[SEGMENT] part ${label} failed to structure after ${attempt + 1} attempts — keeping it as a free part:`, error);
        return buildFreePartFallback(part);
      }
      console.warn(`[SEGMENT] part ${label} structure attempt ${attempt + 1} failed — retrying:`, error);
    }
    await new Promise((resolve) => setTimeout(resolve, STRUCTURE_RETRY_DELAYS_MS[Math.min(attempt, STRUCTURE_RETRY_DELAYS_MS.length - 1)]));
  }
  return buildFreePartFallback(part);
}

// Minimal ParsedWorkout wrapper for a part the structuring step could not handle: one 'free'
// exercise carrying the part's verbatim text. Never used as the session's primary metadata
// unless every other part failed too.
function buildFreePartFallback(part: WorkoutPartSegment): ParsedWorkout {
  const lines = part.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const name = lines[0] ?? 'Workout Part';
  return {
    title: name,
    type: 'mixed',
    format: 'for_time',
    scoreType: 'time',
    exercises: [{
      name,
      type: part.kind === 'strength' ? 'strength' : 'wod',
      prescription: lines.slice(1).join(', ') || name,
      suggestedSets: 1,
      loggingMode: 'free',
      rawText: part.text,
      // A part that fell back to 'free' is the one MOST likely to be corrected — it must carry
      // its scope so "Fix this part" can retry the structuring it just failed.
      partKind: part.kind,
      ...(isMainPartKind(part.kind) ? {} : { isSecondary: true }),
    }],
  };
}
