/**
 * The famous workouts wodi.fit has a public page for — what people search ("fran workout",
 * "murph weights") and the first place a stranger meets Wodi. Marketing copy, not app data:
 * the app never reads this file. Standards are the published ones; when in doubt, leave it out.
 *
 * Copy rule (CLAUDE.md): never call Wodi a "log" or "tracker". wodPages.test.ts enforces it.
 */

export type WodScoring = 'For time' | 'AMRAP' | 'EMOM';

export interface BenchmarkWod {
  /** URL segment: /wods/<slug>/ */
  slug: string;
  name: string;
  /** "Girl" or "Hero" benchmark. */
  family: 'Girl' | 'Hero';
  scoring: WodScoring;
  /** One line under the name: the rep scheme or the clock. */
  scheme: string;
  /** The prescription, one line per movement, as a coach writes it on the board. */
  movements: string[];
  /** Rx loads and heights, women / men. Empty when the workout is bodyweight only. */
  standards: string[];
  /** What the score is, in plain words. */
  scoredBy: string;
  /** One or two sentences: what makes this workout what it is. */
  about: string;
  /** The number on the sample poster. */
  sampleResult: string;
  /** Label above it on the poster. */
  sampleLabel: string;
}

export const BENCHMARK_WODS: readonly BenchmarkWod[] = [
  {
    slug: 'fran', name: 'Fran', family: 'Girl', scoring: 'For time', scheme: '21 – 15 – 9',
    movements: ['Thrusters', 'Pull-ups'],
    standards: ['Thrusters: 65 / 95 lb (29 / 43 kg)'],
    scoredBy: 'Total time to finish 21, 15 and 9 reps of each movement.',
    about: 'The most famous benchmark of them all: two movements, 90 reps, usually over in a few minutes. Short enough to go all out, long enough to hurt.',
    sampleResult: '4:12', sampleLabel: 'MY TIME',
  },
  {
    slug: 'grace', name: 'Grace', family: 'Girl', scoring: 'For time', scheme: '30 reps',
    movements: ['30 Clean and Jerks'],
    standards: ['Clean and jerk: 95 / 135 lb (43 / 61 kg)'],
    scoredBy: 'Total time to complete all 30 reps.',
    about: 'One barbell, one movement, thirty times. A test of how fast you can move a moderate load without falling apart.',
    sampleResult: '3:48', sampleLabel: 'MY TIME',
  },
  {
    slug: 'isabel', name: 'Isabel', family: 'Girl', scoring: 'For time', scheme: '30 reps',
    movements: ['30 Snatches'],
    standards: ['Snatch: 95 / 135 lb (43 / 61 kg)'],
    scoredBy: 'Total time to complete all 30 reps.',
    about: "Grace's sister on the snatch: thirty reps for time, where speed under the bar decides everything.",
    sampleResult: '4:35', sampleLabel: 'MY TIME',
  },
  {
    slug: 'diane', name: 'Diane', family: 'Girl', scoring: 'For time', scheme: '21 – 15 – 9',
    movements: ['Deadlifts', 'Handstand push-ups'],
    standards: ['Deadlift: 155 / 225 lb (70 / 102 kg)'],
    scoredBy: 'Total time to finish 21, 15 and 9 reps of each movement.',
    about: 'Heavy pulling paired with upside-down pressing. The deadlifts tire your grip and back; the handstand push-ups decide the time.',
    sampleResult: '6:20', sampleLabel: 'MY TIME',
  },
  {
    slug: 'elizabeth', name: 'Elizabeth', family: 'Girl', scoring: 'For time', scheme: '21 – 15 – 9',
    movements: ['Squat cleans', 'Ring dips'],
    standards: ['Squat clean: 95 / 135 lb (43 / 61 kg)'],
    scoredBy: 'Total time to finish 21, 15 and 9 reps of each movement.',
    about: 'Fran\'s pattern with a barbell clean and ring dips — legs and lungs first, then pressing strength on the rings.',
    sampleResult: '7:05', sampleLabel: 'MY TIME',
  },
  {
    slug: 'helen', name: 'Helen', family: 'Girl', scoring: 'For time', scheme: '3 rounds',
    movements: ['400 m Run', '21 Kettlebell swings', '12 Pull-ups'],
    standards: ['Kettlebell: 16 / 24 kg (35 / 53 lb)'],
    scoredBy: 'Total time to complete three rounds.',
    about: 'Running, swinging and pulling in three fast rounds — a classic test of how well you recover while moving.',
    sampleResult: '10:44', sampleLabel: 'MY TIME',
  },
  {
    slug: 'karen', name: 'Karen', family: 'Girl', scoring: 'For time', scheme: '150 reps',
    movements: ['150 Wall-ball shots'],
    standards: ['Wall ball: 14 / 20 lb (6 / 9 kg) to a 9 / 10 ft target'],
    scoredBy: 'Total time to complete all 150 reps.',
    about: 'One movement, a hundred and fifty times. Simple on paper; it is all about how you break up the reps.',
    sampleResult: '8:52', sampleLabel: 'MY TIME',
  },
  {
    slug: 'annie', name: 'Annie', family: 'Girl', scoring: 'For time', scheme: '50 – 40 – 30 – 20 – 10',
    movements: ['Double-unders', 'Sit-ups'],
    standards: [],
    scoredBy: 'Total time to finish every round of both movements.',
    about: 'A jump-rope and core descending ladder. Fast if your double-unders are steady, long if they are not.',
    sampleResult: '7:30', sampleLabel: 'MY TIME',
  },
  {
    slug: 'jackie', name: 'Jackie', family: 'Girl', scoring: 'For time', scheme: 'For time',
    movements: ['1,000 m Row', '50 Thrusters', '30 Pull-ups'],
    standards: ['Thrusters: 35 / 45 lb (15 / 20 kg)'],
    scoredBy: 'Total time to finish all three movements in order.',
    about: 'A row, a light barbell and the bar — a chipper that rewards a steady first half.',
    sampleResult: '8:15', sampleLabel: 'MY TIME',
  },
  {
    slug: 'nancy', name: 'Nancy', family: 'Girl', scoring: 'For time', scheme: '5 rounds',
    movements: ['400 m Run', '15 Overhead squats'],
    standards: ['Overhead squat: 65 / 95 lb (29 / 43 kg)'],
    scoredBy: 'Total time to complete five rounds.',
    about: 'Runs that raise your heart rate, then overhead squats that demand you hold it together. Five times.',
    sampleResult: '14:30', sampleLabel: 'MY TIME',
  },
  {
    slug: 'angie', name: 'Angie', family: 'Girl', scoring: 'For time', scheme: '400 reps',
    movements: ['100 Pull-ups', '100 Push-ups', '100 Sit-ups', '100 Air squats'],
    standards: [],
    scoredBy: 'Total time — finish all reps of one movement before starting the next.',
    about: 'A hundred of each, in order. Bodyweight only, and the pull-ups set the pace for everything after.',
    sampleResult: '19:40', sampleLabel: 'MY TIME',
  },
  {
    slug: 'cindy', name: 'Cindy', family: 'Girl', scoring: 'AMRAP', scheme: 'AMRAP 20',
    movements: ['5 Pull-ups', '10 Push-ups', '15 Air squats'],
    standards: [],
    scoredBy: 'Rounds and reps completed in 20 minutes.',
    about: 'Twenty minutes of the simplest bodyweight round there is. The score is how many rounds you can stack.',
    sampleResult: '18+7', sampleLabel: 'ROUNDS',
  },
  {
    slug: 'chelsea', name: 'Chelsea', family: 'Girl', scoring: 'EMOM', scheme: 'EMOM 30',
    movements: ['5 Pull-ups', '10 Push-ups', '15 Air squats'],
    standards: [],
    scoredBy: 'Rounds completed — every minute on the minute, for 30 minutes.',
    about: "Cindy's round, but on a clock: every minute starts a new one. The workout ends when you can't finish inside the minute.",
    sampleResult: '30', sampleLabel: 'ROUNDS',
  },
  {
    slug: 'kelly', name: 'Kelly', family: 'Girl', scoring: 'For time', scheme: '5 rounds',
    movements: ['400 m Run', '30 Box jumps', '30 Wall-ball shots'],
    standards: ['Box: 20 / 24 in (50 / 60 cm)', 'Wall ball: 14 / 20 lb (6 / 9 kg)'],
    scoredBy: 'Total time to complete five rounds.',
    about: 'A long one: running, jumping and throwing for five rounds. Pacing the first round decides the last.',
    sampleResult: '33:10', sampleLabel: 'MY TIME',
  },
  {
    slug: 'murph', name: 'Murph', family: 'Hero', scoring: 'For time', scheme: 'For time, in a vest',
    movements: ['1 mile Run', '100 Pull-ups', '200 Push-ups', '300 Air squats', '1 mile Run'],
    standards: ['Weight vest: 14 / 20 lb (6 / 9 kg)', 'Pull-ups, push-ups and squats may be split as needed'],
    scoredBy: 'Total time, start of the first mile to the end of the second.',
    about: 'The Hero WOD in honour of Navy Lt. Michael Murphy, killed in Afghanistan in 2005 — done by boxes everywhere on Memorial Day.',
    sampleResult: '48:20', sampleLabel: 'MY TIME',
  },
  {
    slug: 'dt', name: 'DT', family: 'Hero', scoring: 'For time', scheme: '5 rounds',
    movements: ['12 Deadlifts', '9 Hang power cleans', '6 Push jerks'],
    standards: ['Barbell: 105 / 155 lb (48 / 70 kg)'],
    scoredBy: 'Total time to complete five rounds — one barbell throughout.',
    about: 'The Hero WOD in honour of USAF Staff Sgt. Timothy P. Davis, killed in Afghanistan in 2009. One bar, three lifts, no setting it down if you can help it.',
    sampleResult: '9:45', sampleLabel: 'MY TIME',
  },
];
