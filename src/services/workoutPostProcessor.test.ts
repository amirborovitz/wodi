import { describe, it, expect } from 'vitest';
import { postProcessParsedWorkout } from './workoutPostProcessor';
import type { ParsedWorkout, ParsedSection } from '../types';

// The real board that surfaced this (31/07/26): a partner for-time chipper written as a
// palindrome. The AI kept every occurrence in ONE single-pass `rounds` section while
// deduplicating the flat movements[] to 4 unique names — two disagreeing lists on one exercise,
// under names that drifted apart ("Twin Kettlebells Clean and Jerk" vs "Clean + Jerk").
const PALINDROME_SECTION: ParsedSection = {
  sectionType: 'rounds',
  rounds: 1,
  movements: [
    { name: 'Run', distance: 600, unit: 'm', together: true },
    { name: 'Twin Kettlebells Clean and Jerk', reps: 80, implementCount: 2 },
    { name: 'Box Jump Over', reps: 60 },
    { name: 'Bar Muscle-up', reps: 40 },
    { name: 'Box Jump Over', reps: 60 },
    { name: 'Twin Kettlebells Clean and Jerk', reps: 80, implementCount: 2 },
    { name: 'Run', distance: 600, unit: 'm', together: true },
  ],
} as unknown as ParsedSection;

function chipper(section: ParsedSection): ParsedWorkout {
  return {
    title: 'WOD',
    type: 'for_time',
    format: 'for_time',
    scoreType: 'time',
    rawText: 'METCON (Long)\nFor time:\n600m run\n80 twin Kettlebells Clean and Jerk\n60 Box Jumps Over\n'
      + '40 Bar Muscle-up\n60 Box Jumps Over\n80 twin Kettlebells Clean and Jerk\n600m run',
    exercises: [{
      name: 'METCON Long For Time',
      type: 'wod',
      loggingMode: 'for_time',
      prescription: '600m run, 80 twin KB C&J, 60 box jumps over, 40 BMU, 60 box jumps over, 80 twin KB C&J, 600m run',
      movements: [
        { name: 'Run', distance: 600, unit: 'm', together: true },
        { name: 'Clean + Jerk', reps: 80, implementCount: 2 },
        { name: 'Box Jump Over', reps: 60 },
        { name: 'Bar Muscle-up', reps: 40 },
      ],
      sections: [section],
    }],
  } as unknown as ParsedWorkout;
}

describe('postProcessParsedWorkout — single-pass section collapse', () => {
  it('collapses a lone single-pass rounds section into flat movements[], keeping board order', () => {
    const ex = postProcessParsedWorkout(chipper(PALINDROME_SECTION)).exercises[0];

    expect(ex.sections).toBeUndefined();
    expect(ex.movements?.map((m) => m.name)).toEqual([
      'Run',
      'Twin Kettlebells Clean and Jerk',
      'Box Jump Over',
      'Bar Muscle-up',
      'Box Jump Over',
      'Twin Kettlebells Clean and Jerk',
      'Run',
    ]);
  });

  it('takes the section list over the AI-deduplicated flat list', () => {
    const ex = postProcessParsedWorkout(chipper(PALINDROME_SECTION)).exercises[0];

    // Both occurrences survive — the whole point: a name-keyed total can no longer be printed
    // against a single line that only did half of it.
    expect(ex.movements?.filter((m) => m.name === 'Twin Kettlebells Clean and Jerk')).toHaveLength(2);
    // The drifted flat-list name is gone; the section's spelling is the surviving one.
    expect(ex.movements?.some((m) => m.name === 'Clean + Jerk')).toBe(false);
  });

  it('does not share mutable references between collapsed occurrences', () => {
    const ex = postProcessParsedWorkout(chipper(PALINDROME_SECTION)).exercises[0];
    const [first, second] = ex.movements!.filter((m) => m.name === 'Box Jump Over');

    expect(first).not.toBe(second);
  });

  // ── Guards: a section that carries real structure is left alone ──

  it('keeps a section that repeats (rounds > 1)', () => {
    const ex = postProcessParsedWorkout(
      chipper({ ...PALINDROME_SECTION, rounds: 3 }),
    ).exercises[0];

    expect(ex.sections).toHaveLength(1);
    expect(ex.sections?.[0].rounds).toBe(3);
  });

  it('keeps a section with a board-written label', () => {
    const ex = postProcessParsedWorkout(
      chipper({ ...PALINDROME_SECTION, label: 'B' }),
    ).exercises[0];

    expect(ex.sections).toHaveLength(1);
  });

  it('keeps a block-scored section', () => {
    const ex = postProcessParsedWorkout(
      chipper({ ...PALINDROME_SECTION, scoreType: 'rounds' } as unknown as ParsedSection),
    ).exercises[0];

    expect(ex.sections).toHaveLength(1);
  });

  it('keeps a buy_in section — the role is structure a flat list cannot state', () => {
    const ex = postProcessParsedWorkout(
      chipper({ ...PALINDROME_SECTION, sectionType: 'buy_in' } as unknown as ParsedSection),
    ).exercises[0];

    expect(ex.sections).toHaveLength(1);
  });

  it('keeps a section whose sole movement list is empty', () => {
    const ex = postProcessParsedWorkout(
      chipper({ ...PALINDROME_SECTION, movements: [] }),
    ).exercises[0];

    expect(ex.sections).toHaveLength(1);
    expect(ex.movements?.map((m) => m.name)).toEqual(['Run', 'Clean + Jerk', 'Box Jump Over', 'Bar Muscle-up']);
  });

  it('keeps multi-section structure untouched', () => {
    const workout = chipper(PALINDROME_SECTION);
    workout.exercises[0].sections = [
      { sectionType: 'rounds', rounds: 1, movements: [{ name: 'Run', distance: 400, unit: 'm' }] },
      { sectionType: 'rounds', rounds: 1, movements: [{ name: 'Box Jump Over', reps: 30 }] },
    ] as unknown as ParsedSection[];

    expect(postProcessParsedWorkout(workout).exercises[0].sections).toHaveLength(2);
  });
});

// The SAME board, parsed a second time (30/07/26 19:45) — no sections at all, and the AI
// half-repaired the chipper: it duplicated the run but collapsed the two C&J and two box-jump
// lines to one each. movements[] arrives as 5 where the board writes 7.
const HALF_COLLAPSED: ParsedWorkout = {
  title: 'WOD',
  type: 'for_time',
  format: 'for_time',
  scoreType: 'time',
  exercises: [{
    name: 'Endurance Circuit For Time',
    type: 'wod',
    loggingMode: 'for_time',
    prescription: '600m Run (together), 80 twin KB Clean and Jerk, 60 Box Jumps Over, 40 Bar Muscle-up, 60 Box Jumps Over, 80 twin KB Clean and Jerk, 600m Run (together)',
    rawText: 'METCON (Long)\nIn pairs, I go you go (however):\nFor time:\n600m run (together)\n'
      + "80 twin Kettlebell's Clean and Jerk\n60 Box Jumps Over\n"
      + '40 Bar Muscle-up / 60 Chest to Bar Pull-ups / Pull-ups\n60 Box Jumps Over\n'
      + "80 twin Kettlebell's Clean and Jerk\n600m run (together)\n"
      + 'WEIGHT: 12/20kg (x2) | Advanced: 16/24kg (x2)\n30 minutes T.C.',
    movements: [
      { name: 'Run', distance: 600, unit: 'm', together: true },
      { name: 'KB Clean + Jerk', reps: 80, implementCount: 2 },
      { name: 'Box Jump Over', reps: 60 },
      { name: 'Bar Muscle-up', reps: 40 },
      { name: 'Run', distance: 600, unit: 'm', together: true },
    ],
  }],
} as unknown as ParsedWorkout;

describe('postProcessParsedWorkout — interleaved rebuild', () => {
  it('rebuilds a half-collapsed chipper whose movements[] already repeats one movement', () => {
    const ex = postProcessParsedWorkout(HALF_COLLAPSED).exercises[0];

    // Two entries of the SAME movement are not an ambiguous match — the rebuild must not bail.
    expect(ex.movements?.map((m) => m.name)).toEqual([
      'Run',
      'KB Clean + Jerk',
      'Box Jump Over',
      'Bar Muscle-up',
      'Box Jump Over',
      'KB Clean + Jerk',
      'Run',
    ]);
  });

  it('still refuses to reorder when two DIFFERENT movements match a line equally', () => {
    const ambiguous = JSON.parse(JSON.stringify(HALF_COLLAPSED)) as ParsedWorkout;
    // "Pull-up" and "Bar Muscle-up" both score 1 on "40 Bar Muscle-up / 60 ... Pull-ups".
    ambiguous.exercises[0].movements = [
      { name: 'Run', distance: 600, unit: 'm' },
      { name: 'Bar Muscle-up', reps: 40 },
      { name: 'Up', reps: 10 },
    ] as unknown as ParsedWorkout['exercises'][0]['movements'];

    expect(postProcessParsedWorkout(ambiguous).exercises[0].movements?.map((m) => m.name))
      .toEqual(['Run', 'Bar Muscle-up', 'Up']);
  });
});

// The real board that surfaced this (04/08/26): a 3-tier descending ladder, each tier opening
// with a run of its OWN distance. The AI reads it correctly — three single-pass rounds sections,
// runs at 800/600/400. Lifting those runs into sibling buy_in sections erased them: the poster's
// ladder rows and the story-logging inputs both build a tier from `rounds` sections alone, so the
// run showed up in NEITHER, and cloning tier 1's lead made the distance total 2400m for 1800m run.
function ladderTier(distance: number, reps: number, burpees: number, rounds = 1): ParsedSection {
  return {
    sectionType: 'rounds',
    rounds,
    movements: [
      { name: 'Run', distance, unit: 'm' },
      { name: 'Thruster', reps, rxWeights: { male: 20, female: 15, unit: 'kg' } },
      { name: 'Box Jump', reps },
      { name: 'Burpees Over Bar', reps: burpees },
    ],
  } as unknown as ParsedSection;
}

function descendingLadder(sections: ParsedSection[], movements?: unknown[]): ParsedWorkout {
  return {
    title: 'Metcon',
    type: 'for_time',
    format: 'for_time',
    scoreType: 'time',
    rawText: 'Metcon\n\nA. For time:\n800m run\n40 Thrusters @15/20kg (empty BB)\n40 box jumps\n'
      + '20 burpees over the bar\n\n600m run\n30 Thrusters @15/20kg (empty BB)\n30 box jumps\n'
      + '30 burpees over the bar\n\n400m run\n20 Thrusters @15/20kg (empty BB)\n20 box jumps\n'
      + '40 burpees over the bar\n\n35 minutes T.C.',
    exercises: [{
      name: 'Pyramid For Time',
      type: 'wod',
      loggingMode: 'for_time',
      suggestedSets: 3,
      prescription: '35 min cap, descending reps pyramid',
      movements: movements ?? [
        { name: 'Run', distance: 800, unit: 'm' },
        { name: 'Thruster', reps: 40, rxWeights: { male: 20, female: 15, unit: 'kg' } },
        { name: 'Box Jump', reps: 40 },
        { name: 'Burpees Over Bar', reps: 20 },
      ],
      sections,
    }],
  } as unknown as ParsedWorkout;
}

describe('postProcessParsedWorkout — section-shadowed lead-in', () => {
  const SINGLE_PASS = [ladderTier(800, 40, 20), ladderTier(600, 30, 30), ladderTier(400, 20, 40)];

  it('leaves a lead-in the AI placed exactly where the AI placed it', () => {
    const ex = postProcessParsedWorkout(descendingLadder(SINGLE_PASS)).exercises[0];

    // Untouched: no invented buy_in sections, and every tier keeps its OWN distance. The run the
    // board opens each tier with is still the tier's first movement — where the poster ladder row
    // and the logging input builder read it from.
    expect(ex.sections?.map((s) => s.sectionType)).toEqual(['rounds', 'rounds', 'rounds']);
    expect(ex.sections?.map((s) => s.movements[0].name)).toEqual(['Run', 'Run', 'Run']);
    expect(ex.sections?.map((s) => s.movements[0].distance)).toEqual([800, 600, 400]);
  });

  it('leaves a placed lead-in alone in REPEATING tiers too — placement is the AI\'s call', () => {
    const repeating = [ladderTier(800, 40, 20, 3), ladderTier(600, 30, 30, 2)];
    const ex = postProcessParsedWorkout(descendingLadder(repeating)).exercises[0];

    expect(ex.sections?.map((s) => s.sectionType)).toEqual(['rounds', 'rounds']);
    expect(ex.sections?.map((s) => s.movements[0].distance)).toEqual([800, 600]);
  });

  it('backfills a lead-in the AI left ONLY in movements[], where sections shadow it', () => {
    // Sections shadow movements[], so a run the AI left ONLY at top level is invisible without
    // this repair. Single-pass tiers run it once each, so it belongs inside them.
    const noRuns = SINGLE_PASS.map((s) => ({ ...s, movements: s.movements.slice(1) })) as ParsedSection[];
    const ex = postProcessParsedWorkout(descendingLadder(noRuns)).exercises[0];

    expect(ex.sections?.map((s) => s.sectionType)).toEqual(['rounds', 'rounds', 'rounds']);
    expect(ex.sections?.map((s) => s.movements[0].name)).toEqual(['Run', 'Run', 'Run']);
    expect(ex.sections?.map((s) => s.movements.length)).toEqual([4, 4, 4]);
  });

  it('leaves a reps-based lead-in alone — the guard is a cardio metric, not position', () => {
    const repsLead = SINGLE_PASS.map((s) => ({
      ...s,
      movements: [{ name: 'Pull-up', reps: 10 }, ...s.movements.slice(1)],
    })) as ParsedSection[];
    const ex = postProcessParsedWorkout(descendingLadder(repsLead, [
      { name: 'Pull-up', reps: 10 },
      { name: 'Thruster', reps: 40, rxWeights: { male: 20, female: 15, unit: 'kg' } },
      { name: 'Box Jump', reps: 40 },
      { name: 'Burpees Over Bar', reps: 20 },
    ])).exercises[0];

    expect(ex.sections?.map((s) => s.sectionType)).toEqual(['rounds', 'rounds', 'rounds']);
    expect(ex.sections?.map((s) => s.movements[0].name)).toEqual(['Pull-up', 'Pull-up', 'Pull-up']);
  });
});
