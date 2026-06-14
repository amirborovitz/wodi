// ═══════════════════════════════════════════════════════════════════════════
// wodi app — sample data. Workouts (each carries a real poster), and Records.
// ═══════════════════════════════════════════════════════════════════════════

const USER = { name: 'Maya', handle: '@maya.lifts', joined: 'Jan 2026' };

// monthly EP — the native wodi unit. NEVER shown as calories.
const MONTH_EP = 1240;

// helper to keep WOD objects compact
const W = (o) => o;

const WORKOUTS = [
  {
    id: 'anvil', skin: 'slab', vibe: 'smoked', ep: 312, isPR: false, when: 'Today',
    wod: W({
      type: 'For Time', title: 'ANVIL', date: '09 JUN 26', format: '12 ROUNDS', sub: '30 min cap',
      blocks: [{ label: null, lines: [
        { rx: '10 Deadlift', load: '60/40', mine: '60kg' },
        { rx: '10 Front Squat', load: '45/30', mine: '45kg' },
        { rx: '10 Pull-up', load: '', mine: '' },
        { rx: '10 Push Press', load: '45/30', mine: '45kg' },
        { rx: '10 Toes-to-Bar', load: '', mine: '' },
      ]}],
      result: { label: 'MY TIME', value: '31:00' }, achievement: { label: "RX'D" },
      totals: { time: '31:00', reps: '600' },
    }),
  },
  {
    id: 'deadlift-pr', skin: 'flare', vibe: 'solid', ep: 180, isPR: true, prFrom: '140kg', when: 'Yesterday',
    wod: W({
      type: 'Strength', title: 'DEADLIFT', date: '08 JUN 26', format: 'BUILD TO 1RM', sub: 'singles',
      blocks: [{ label: null, lines: [
        { rx: 'Single', load: '', mine: '130kg' },
        { rx: 'Single', load: '', mine: '140kg' },
        { rx: 'Single', load: '', mine: '145kg' },
        { rx: 'Single', load: '', mine: '150kg' },
      ]}],
      result: { label: 'NEW 1RM', value: '150kg' }, achievement: { label: 'PR' }, prFrom: '140kg',
      totals: { reps: '4' },
    }),
  },
  {
    id: 'fran', skin: 'slab', vibe: 'wrecked', ep: 210, isPR: true, prFrom: '4:18', when: '2 days ago',
    wod: W({
      type: 'For Time', title: 'FRAN', date: '07 JUN 26', format: '21-15-9', sub: 'benchmark',
      blocks: [{ label: null, lines: [
        { rx: 'Thruster', load: '43/30', mine: '43kg' },
        { rx: 'Pull-up', load: '', mine: 'RX' },
      ]}],
      result: { label: 'MY TIME', value: '3:42' }, achievement: { label: 'PR' }, prFrom: '4:18',
      totals: { time: '3:42', reps: '90' },
    }),
  },
  {
    id: 'metcon', skin: 'chalk', vibe: 'cooked', ep: 264, isPR: false, when: '4 days ago',
    wod: W({
      type: 'AMRAP', title: null, date: '05 JUN 26', format: '3 × 12-MIN', sub: '1 min rest',
      blocks: [
        { label: 'AMRAP 1', cap: '12:00', score: '4+12', scoreSub: 'rds', lines: [
          { rx: '8/10 cal Bike', load: '', mine: '' },
          { rx: '10 DB Burpee', load: '22.5/15', mine: '22.5kg' },
          { rx: '10 DB Push Press', load: '22.5/15', mine: '22.5kg' },
        ]},
        { label: 'AMRAP 2', cap: '12:00', score: '6+0', scoreSub: 'rds', lines: [
          { rx: '5 Pull-up', load: '', mine: '' },
          { rx: '10 Push-up', load: '', mine: '' },
          { rx: '15 Air Squat', load: '', mine: '' },
        ]},
      ],
      result: { label: 'TOTAL REPS', value: '287' }, achievement: { label: '+18 REPS' },
      totals: { time: '36:00', reps: '287' },
    }),
  },
  {
    id: 'helen', skin: 'chalk', vibe: 'sweaty', ep: 198, isPR: false, when: '6 days ago',
    wod: W({
      type: 'For Time', title: 'HELEN', date: '03 JUN 26', format: '3 ROUNDS', sub: 'benchmark',
      blocks: [{ label: null, lines: [
        { rx: '400m Run', load: '', mine: '' },
        { rx: '21 KB Swing', load: '24/16', mine: '24kg' },
        { rx: '12 Pull-up', load: '', mine: 'RX' },
      ]}],
      result: { label: 'MY TIME', value: '9:48' }, achievement: { label: 'FINISHED' },
      totals: { time: '9:48', reps: '99' },
    }),
  },
  {
    id: 'emom', skin: 'flare', vibe: 'chill', ep: 156, isPR: false, when: '8 days ago',
    wod: W({
      type: 'EMOM', title: null, date: '01 JUN 26', format: '20-MIN EMOM', sub: 'alt. min',
      blocks: [{ label: null, lines: [
        { rx: 'Min 1 · 12 cal Row', load: '', mine: '✓' },
        { rx: 'Min 2 · 10 Burpee', load: '', mine: '✓' },
      ]}],
      result: { label: 'ROUNDS', value: '20/20' }, achievement: { label: 'DAY 12' },
      totals: { time: '20:00' },
    }),
  },
  {
    id: 'backsquat', skin: 'slab', vibe: 'solid', ep: 174, isPR: false, when: '10 days ago',
    wod: W({
      type: 'Strength', title: 'BACK SQUAT', date: '30 MAY 26', format: '5 × 5', sub: 'build to heavy',
      blocks: [{ label: null, lines: [
        { rx: 'Set 1 · 5', load: '', mine: '80kg' },
        { rx: 'Set 2 · 5', load: '', mine: '90kg' },
        { rx: 'Set 3 · 5', load: '', mine: '100kg' },
        { rx: 'Set 4 · 5', load: '', mine: '105kg' },
        { rx: 'Set 5 · 5', load: '', mine: '105kg' },
      ]}],
      result: { label: 'TOP SET', value: '105kg' }, achievement: { label: 'SOLID' },
      totals: { reps: '25' },
    }),
  },
  {
    id: 'grace', skin: 'chalk', vibe: 'cooked', ep: 188, isPR: false, when: '12 days ago',
    wod: W({
      type: 'For Time', title: 'GRACE', date: '28 MAY 26', format: '30 REPS', sub: 'benchmark',
      blocks: [{ label: null, lines: [
        { rx: 'Clean & Jerk', load: '61/43', mine: '50kg' },
      ]}],
      result: { label: 'MY TIME', value: '4:12' }, achievement: { label: 'FINISHED' },
      totals: { time: '4:12', reps: '30' },
    }),
  },
];

// ── Records (PRs) — tight scope: weight PRs + benchmark time PRs ──
const RECORDS = [
  { id: 'deadlift', kind: 'weight', movement: 'Deadlift', value: '150kg', month: 'Jun 2026', fresh: true,
    history: [{ v: '120kg', m: 'Feb 2026' }, { v: '135kg', m: 'Mar 2026' }, { v: '140kg', m: 'Apr 2026' }, { v: '150kg', m: 'Jun 2026' }] },
  { id: 'backsquat', kind: 'weight', movement: 'Back Squat', value: '105kg', month: 'May 2026',
    history: [{ v: '85kg', m: 'Jan 2026' }, { v: '95kg', m: 'Mar 2026' }, { v: '105kg', m: 'May 2026' }] },
  { id: 'bench', kind: 'weight', movement: 'Bench Press', value: '85kg', month: 'Apr 2026',
    history: [{ v: '70kg', m: 'Jan 2026' }, { v: '78kg', m: 'Feb 2026' }, { v: '85kg', m: 'Apr 2026' }] },
  { id: 'clean', kind: 'weight', movement: 'Clean', value: '80kg', month: 'May 2026',
    history: [{ v: '65kg', m: 'Feb 2026' }, { v: '72kg', m: 'Apr 2026' }, { v: '80kg', m: 'May 2026' }] },
  { id: 'snatch', kind: 'weight', movement: 'Snatch', value: '58kg', month: 'Mar 2026',
    history: [{ v: '45kg', m: 'Jan 2026' }, { v: '52kg', m: 'Feb 2026' }, { v: '58kg', m: 'Mar 2026' }] },
  { id: 'press', kind: 'weight', movement: 'Strict Press', value: '52kg', month: 'Apr 2026',
    history: [{ v: '42kg', m: 'Jan 2026' }, { v: '48kg', m: 'Mar 2026' }, { v: '52kg', m: 'Apr 2026' }] },
  { id: 'fran', kind: 'time', movement: 'Fran', value: '3:42', month: 'Jun 2026', fresh: true,
    history: [{ v: '5:30', m: 'Feb 2026' }, { v: '4:48', m: 'Apr 2026' }, { v: '4:18', m: 'May 2026' }, { v: '3:42', m: 'Jun 2026' }] },
  { id: 'helen', kind: 'time', movement: 'Helen', value: '9:15', month: 'May 2026',
    history: [{ v: '11:20', m: 'Feb 2026' }, { v: '10:05', m: 'Apr 2026' }, { v: '9:15', m: 'May 2026' }] },
  { id: 'grace', kind: 'time', movement: 'Grace', value: '4:12', month: 'May 2026',
    history: [{ v: '6:10', m: 'Jan 2026' }, { v: '5:02', m: 'Mar 2026' }, { v: '4:12', m: 'May 2026' }] },
  { id: 'diane', kind: 'time', movement: 'Diane', value: '5:40', month: 'Apr 2026',
    history: [{ v: '7:30', m: 'Jan 2026' }, { v: '6:20', m: 'Mar 2026' }, { v: '5:40', m: 'Apr 2026' }] },
];

const LIFETIME = { workouts: 84, posters: 84, prs: RECORDS.length, ep: '38.2k' };

// ── Quick-pick templates for the "Log a workout" flow ──
const WOD_TEMPLATES = [
  { name: 'Fran', type: 'For Time', format: '21-15-9', sub: 'benchmark', ep: 195,
    blocks: [{ label: null, lines: [
      { rx: 'Thruster', load: '43/30', mine: '43kg' },
      { rx: 'Pull-up', load: '', mine: 'RX' },
    ]}],
    result: { label: 'MY TIME', value: '4:05' }, totals: { time: '4:05', reps: '90' } },
  { name: 'Cindy', type: 'AMRAP', format: '20-MIN AMRAP', sub: '5-10-15', ep: 230,
    blocks: [{ label: null, lines: [
      { rx: '5 Pull-up', load: '', mine: '' },
      { rx: '10 Push-up', load: '', mine: '' },
      { rx: '15 Air Squat', load: '', mine: '' },
    ]}],
    result: { label: 'ROUNDS', value: '18+7' }, totals: { time: '20:00', reps: '472' } },
  { name: 'Helen', type: 'For Time', format: '3 ROUNDS', sub: 'benchmark', ep: 188,
    blocks: [{ label: null, lines: [
      { rx: '400m Run', load: '', mine: '' },
      { rx: '21 KB Swing', load: '24/16', mine: '24kg' },
      { rx: '12 Pull-up', load: '', mine: 'RX' },
    ]}],
    result: { label: 'MY TIME', value: '10:32' }, totals: { time: '10:32', reps: '99' } },
  { name: 'Back Squat', type: 'Strength', format: '5 × 5', sub: 'build to heavy', ep: 165,
    blocks: [{ label: null, lines: [
      { rx: 'Set 1 · 5', load: '', mine: '70kg' },
      { rx: 'Set 2 · 5', load: '', mine: '80kg' },
      { rx: 'Set 3 · 5', load: '', mine: '90kg' },
      { rx: 'Set 4 · 5', load: '', mine: '95kg' },
      { rx: 'Set 5 · 5', load: '', mine: '95kg' },
    ]}],
    result: { label: 'TOP SET', value: '95kg' }, totals: { reps: '25' } },
];

Object.assign(window, { USER, MONTH_EP, WORKOUTS, RECORDS, LIFETIME, WOD_TEMPLATES });
