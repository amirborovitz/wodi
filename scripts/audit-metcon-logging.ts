/**
 * audit-metcon-logging.ts
 *
 * Standalone audit script that runs the WodBoard logging pipeline
 * (postProcessParsedWorkout → calculateWorkloadBreakdown) on 20 realistic
 * ParsedWorkout fixtures and checks for correctness.
 *
 * Run with:  npx tsx scripts/audit-metcon-logging.ts
 */

// ── Silence the console.warn / console.log noise from post-processor ──────────
const _origWarn = console.warn;
const _origLog  = console.log;
console.warn = () => {};
console.log  = () => {};

import { postProcessParsedWorkout } from '../src/services/workoutPostProcessor';
import { calculateWorkloadBreakdown } from '../src/services/workloadCalculation';
import type {
  ParsedWorkout,
  ParsedExercise,
  WorkloadBreakdown,
} from '../src/types';

// Restore logging so our own audit prints are visible
console.warn = _origWarn;
console.log  = _origLog;

// ── Helpers ────────────────────────────────────────────────────────────────────

function getHeroLabel(workout: ParsedWorkout, wb: WorkloadBreakdown): string {
  const fmt = workout.format;
  const score = workout.scoreType ?? 'rounds_reps';
  if (fmt === 'amrap' || score === 'rounds_reps') return 'X ROUNDS (AMRAP)';
  if (fmt === 'for_time' || score === 'time') return 'MM:SS (for time)';
  if (fmt === 'strength' || score === 'load') return `${wb.grandTotalVolume} KG VOLUME`;
  if (fmt === 'emom') return 'EMOM COMPLETE';
  if (fmt === 'intervals') return 'INTERVALS DONE';
  if (fmt === 'tabata') return 'TABATA DONE';
  if (wb.grandTotalCalories && wb.grandTotalCalories > 0) return `${wb.grandTotalCalories} CAL`;
  if (wb.grandTotalDistance && wb.grandTotalDistance > 0) return `${wb.grandTotalDistance} M`;
  if (wb.grandTotalVolume > 0) {
    const tons = wb.grandTotalVolume / 1000;
    return tons >= 1 ? `${tons.toFixed(2)} TONS` : `${wb.grandTotalVolume} KG`;
  }
  return 'EP FALLBACK';
}

interface MovementInfo { name: string; countingMode?: string; perRound?: boolean; role?: string }

function collectMovements(workout: ParsedWorkout): MovementInfo[] {
  const result: MovementInfo[] = [];
  for (const ex of workout.exercises) {
    if (ex.sections && ex.sections.length > 0) {
      for (const section of ex.sections) {
        for (const mov of section.movements) {
          result.push({ name: mov.name, countingMode: mov.countingMode, perRound: mov.perRound, role: mov.role });
        }
      }
    } else if (ex.movements) {
      for (const mov of ex.movements) {
        result.push({ name: mov.name, countingMode: mov.countingMode, perRound: mov.perRound, role: mov.role });
      }
    }
  }
  return result;
}

interface AuditResult {
  index: number;
  name: string;
  pass: boolean;
  movementsAfterProcess: string[];
  totals: { reps: number; volume: number; distance?: number; calories?: number };
  buyInStatus: string;
  hero: string;
  issues: string[];
}

function runAudit(
  index: number,
  name: string,
  raw: ParsedWorkout,
  checks: (processed: ParsedWorkout, wb: WorkloadBreakdown, issues: string[]) => void,
): AuditResult {
  const issues: string[] = [];
  let processed: ParsedWorkout;
  let wb: WorkloadBreakdown;

  try {
    processed = postProcessParsedWorkout(raw);
  } catch (err) {
    return {
      index, name, pass: false,
      movementsAfterProcess: [],
      totals: { reps: 0, volume: 0 },
      buyInStatus: 'unknown',
      hero: 'error',
      issues: [`postProcess threw: ${(err as Error).message}`],
    };
  }

  try {
    wb = calculateWorkloadBreakdown(processed);
  } catch (err) {
    return {
      index, name, pass: false,
      movementsAfterProcess: [],
      totals: { reps: 0, volume: 0 },
      buyInStatus: 'unknown',
      hero: 'error',
      issues: [`calculateWorkload threw: ${(err as Error).message}`],
    };
  }

  // Run caller-supplied checks
  checks(processed, wb, issues);

  // Collect movement info
  const movs = collectMovements(processed);
  const movementsAfterProcess = movs.map(m => {
    const tags: string[] = [];
    if (m.countingMode) tags.push(m.countingMode);
    if (m.role) tags.push(m.role);
    return `${m.name}[${tags.join('|') || 'per_round'}]`;
  });

  // Buy-in status summary
  const onceMoves = movs.filter(m => m.countingMode === 'once' || m.perRound === false || m.role === 'buy_in' || m.role === 'cash_out');
  let buyInStatus: string;
  if (onceMoves.length === 0) {
    buyInStatus = 'none';
  } else {
    buyInStatus = `${onceMoves.length} once-movement(s): ${onceMoves.map(m => m.name).join(', ')}`;
  }

  const totals = {
    reps: wb.grandTotalReps,
    volume: wb.grandTotalVolume,
    distance: wb.grandTotalDistance,
    calories: wb.grandTotalCalories,
  };

  const hero = getHeroLabel(processed, wb);

  return {
    index, name, pass: issues.length === 0,
    movementsAfterProcess, totals, buyInStatus, hero, issues,
  };
}

// ── Assertion helpers ──────────────────────────────────────────────────────────

function expectReps(wb: WorkloadBreakdown, movName: string, expectedReps: number, issues: string[], label: string) {
  const mov = wb.movements.find(m => m.name.toLowerCase().includes(movName.toLowerCase()));
  if (!mov) {
    issues.push(`${label}: movement "${movName}" not found in workload`);
    return;
  }
  if (mov.totalReps !== expectedReps) {
    issues.push(`${label}: "${movName}" expected ${expectedReps} reps, got ${mov.totalReps}`);
  }
}

function expectDistance(wb: WorkloadBreakdown, movName: string, expectedDist: number, issues: string[], label: string) {
  const mov = wb.movements.find(m => m.name.toLowerCase().includes(movName.toLowerCase()));
  if (!mov) {
    issues.push(`${label}: movement "${movName}" not found in workload`);
    return;
  }
  if (mov.totalDistance !== expectedDist) {
    issues.push(`${label}: "${movName}" expected ${expectedDist}m, got ${mov.totalDistance}m`);
  }
}

function expectCalories(wb: WorkloadBreakdown, movName: string, expectedCal: number, issues: string[], label: string) {
  const mov = wb.movements.find(m => m.name.toLowerCase().includes(movName.toLowerCase()));
  if (!mov) {
    issues.push(`${label}: movement "${movName}" not found in workload`);
    return;
  }
  if (mov.totalCalories !== expectedCal) {
    issues.push(`${label}: "${movName}" expected ${expectedCal} cal, got ${mov.totalCalories} cal`);
  }
}

function expectOnceCounted(processed: ParsedWorkout, movName: string, issues: string[], label: string) {
  const movs = collectMovements(processed);
  const mov = movs.find(m => m.name.toLowerCase().includes(movName.toLowerCase()));
  if (!mov) {
    issues.push(`${label}: movement "${movName}" not found after post-process`);
    return;
  }
  const isOnce = mov.countingMode === 'once'
    || mov.countingMode === 'per_interval'
    || mov.perRound === false
    || mov.role === 'buy_in'
    || mov.role === 'cash_out';
  if (!isOnce) {
    issues.push(`${label}: "${movName}" expected once/per_interval counting, got countingMode="${mov.countingMode}" perRound=${mov.perRound} role=${mov.role}`);
  }
}

function expectSectionType(processed: ParsedWorkout, sectionType: string, issues: string[], label: string) {
  let found = false;
  for (const ex of processed.exercises) {
    if (ex.sections?.some(s => s.sectionType === sectionType)) {
      found = true;
      break;
    }
  }
  if (!found) {
    issues.push(`${label}: section type "${sectionType}" not found in any exercise`);
  }
}

// ── FIXTURES ───────────────────────────────────────────────────────────────────

const fixtures: Array<{ name: string; workout: ParsedWorkout; checks: (p: ParsedWorkout, wb: WorkloadBreakdown, issues: string[]) => void }> = [

  // ── 1. Simple AMRAP 12 — 3 movements, no buy-in ─────────────────────────────
  {
    name: 'Simple AMRAP 12 — 3 movements, no buy-in',
    workout: {
      title: 'AMRAP 12',
      type: 'amrap',
      format: 'amrap',
      scoreType: 'rounds_reps',
      timeCap: 720,
      exercises: [{
        name: 'AMRAP 12',
        type: 'wod',
        prescription: 'AMRAP 12',
        suggestedSets: 1,
        loggingMode: 'amrap',
        movements: [
          { name: 'Pull-up', reps: 5, isBodyweight: true },
          { name: 'Push-up', reps: 10, isBodyweight: true },
          { name: 'Air Squat', reps: 15, isBodyweight: true },
        ],
      }],
    },
    checks: (_p, wb, issues) => {
      if (wb.grandTotalReps <= 0) issues.push('AMRAP 12: should have rep totals (1 round estimate)');
      const onceMoves = collectMovements(_p).filter(m => m.countingMode === 'once');
      if (onceMoves.length > 0) issues.push(`AMRAP 12: unexpected once-movements: ${onceMoves.map(m=>m.name).join(',')}`);
    },
  },

  // ── 2. RFT (8 rounds) — barbell + bodyweight ─────────────────────────────────
  {
    name: 'RFT 8 rounds — barbell + bodyweight',
    workout: {
      title: '8 RFT',
      type: 'for_time',
      format: 'for_time',
      scoreType: 'time',
      exercises: [{
        name: '8 RFT',
        type: 'wod',
        prescription: '8 rounds: 10 Deadlift @100kg, 15 Box Jump',
        suggestedSets: 8,
        loggingMode: 'for_time',
        movements: [
          { name: 'Deadlift', reps: 10, rxWeights: { male: 100, female: 70, unit: 'kg' } },
          { name: 'Box Jump', reps: 15, isBodyweight: true },
        ],
      }],
    },
    checks: (_p, wb, issues) => {
      expectReps(wb, 'Deadlift', 80, issues, 'RFT 8rds');
      expectReps(wb, 'Box Jump', 120, issues, 'RFT 8rds');
    },
  },

  // ── 3. RFT with buy-in and cash-out ──────────────────────────────────────────
  {
    name: 'RFT with buy-in & cash-out',
    workout: {
      title: 'RFT with buy-in',
      type: 'for_time',
      format: 'for_time',
      scoreType: 'time',
      exercises: [{
        name: 'RFT with buy-in',
        type: 'wod',
        prescription: '600m Run buy-in, 8 RFT: Push Press 60/40kg, TTB, KB Swing 32/24kg, then 600m Run cash-out',
        suggestedSets: 8,
        loggingMode: 'for_time',
        sections: [
          {
            sectionType: 'buy_in',
            rounds: 1,
            movements: [{ name: 'Run', distance: 600, unit: 'm', role: 'buy_in', perRound: false }],
          },
          {
            sectionType: 'rounds',
            rounds: 8,
            movements: [
              { name: 'Push Press', reps: 10, rxWeights: { male: 60, female: 40, unit: 'kg' } },
              { name: 'Toes to Bar', reps: 10, isBodyweight: true },
              { name: 'American Kettlebell Swing', reps: 15, rxWeights: { male: 32, female: 24, unit: 'kg' } },
            ],
          },
          {
            sectionType: 'cash_out',
            rounds: 1,
            movements: [{ name: 'Run', distance: 600, unit: 'm', role: 'cash_out', perRound: false }],
          },
        ],
      }],
    },
    checks: (p, wb, issues) => {
      // Buy-in run = 600m once
      expectSectionType(p, 'buy_in', issues, 'RFT buy-in/cash-out');
      expectSectionType(p, 'cash_out', issues, 'RFT buy-in/cash-out');
      // Run should total 1200m (600 buy-in + 600 cash-out, merged by name)
      expectDistance(wb, 'Run', 1200, issues, 'RFT buy-in/cash-out');
      // Push Press: 10 × 8 = 80
      expectReps(wb, 'Push Press', 80, issues, 'RFT buy-in/cash-out');
      // KB Swing: 15 × 8 = 120
      expectReps(wb, 'American Kettlebell Swing', 120, issues, 'RFT buy-in/cash-out');
    },
  },

  // ── 4. AMRAP intervals with buy-in ───────────────────────────────────────────
  {
    name: 'AMRAP intervals with buy-in (every 4min x3)',
    workout: {
      title: 'Every 4:00 x3',
      type: 'amrap',
      format: 'amrap_intervals',
      scoreType: 'rounds_reps',
      sets: 3,
      exercises: [{
        name: 'Every 4:00 x3',
        type: 'wod',
        prescription: 'Every 4:00 x3: 200m Run buy-in, then AMRAP: Bar Muscle-up, Box Jump, KB Swing 32/24kg',
        suggestedSets: 3,
        loggingMode: 'amrap_intervals',
        movements: [
          { name: 'Run', distance: 200, unit: 'm', perRound: false, role: 'buy_in' },
          { name: 'Bar Muscle-up', reps: 3, isBodyweight: true },
          { name: 'Box Jump', reps: 6, isBodyweight: true },
          { name: 'American Kettlebell Swing', reps: 9, rxWeights: { male: 32, female: 24, unit: 'kg' } },
        ],
      }],
    },
    checks: (p, wb, issues) => {
      // Run is buy-in — done once per interval, so 200m × 3 intervals = 600m
      const runMov = collectMovements(p).find(m => m.name.toLowerCase().includes('run'));
      if (!runMov) {
        issues.push('AMRAP intervals buy-in: Run movement not found');
      } else {
        const isOnceOrPerInterval = runMov.countingMode === 'once'
          || runMov.countingMode === 'per_interval'
          || runMov.perRound === false
          || runMov.role === 'buy_in';
        if (!isOnceOrPerInterval) {
          issues.push(`AMRAP intervals buy-in: Run should be per_interval/once, got countingMode="${runMov.countingMode}" perRound=${runMov.perRound}`);
        }
      }
      // AMRAP movements should be multiplied by intervalCount (3)
      if (wb.grandTotalReps <= 0) issues.push('AMRAP intervals buy-in: should have some reps');
    },
  },

  // ── 5. Partner RFT IGUG (6 each) — 3 movements ───────────────────────────────
  {
    name: 'Partner RFT IGUG (6 each)',
    workout: {
      title: 'Partner RFT IGUG',
      type: 'for_time',
      format: 'for_time',
      scoreType: 'time',
      partnerWorkout: true,
      teamSize: 2,
      exercises: [{
        name: 'Partner RFT IGUG',
        type: 'wod',
        prescription: 'IGUG 6 rounds each: 10 Thruster 43/29kg, 12 Pull-up, 400m Run',
        suggestedSets: 6,
        loggingMode: 'for_time',
        movements: [
          { name: 'Thruster', reps: 10, rxWeights: { male: 43, female: 29, unit: 'kg' } },
          { name: 'Pull-up', reps: 12, isBodyweight: true },
          { name: 'Run', distance: 400, unit: 'm' },
        ],
      }],
    },
    checks: (_p, wb, issues) => {
      // 10 × 6 = 60 Thrusters per person
      expectReps(wb, 'Thruster', 60, issues, 'Partner IGUG');
      // Pull-ups: 12 × 6 = 72
      expectReps(wb, 'Pull-up', 72, issues, 'Partner IGUG');
    },
  },

  // ── 6. Partner workout with "together" run ───────────────────────────────────
  {
    name: 'Partner with together run',
    workout: {
      title: 'Partner WOD',
      type: 'for_time',
      format: 'for_time',
      scoreType: 'time',
      partnerWorkout: true,
      teamSize: 2,
      rawText: 'Partner WOD 5 RFT: 300m run (together), 20 wall balls',
      exercises: [{
        name: 'Partner WOD',
        type: 'wod',
        prescription: '5 RFT: 300m run (together), 20 Wall Ball',
        suggestedSets: 5,
        loggingMode: 'for_time',
        movements: [
          { name: 'Run', distance: 300, unit: 'm', together: true },
          { name: 'Wall Ball', reps: 20, rxWeights: { male: 9, female: 6, unit: 'kg' } },
        ],
      }],
    },
    checks: (p, _wb, issues) => {
      const runMov = collectMovements(p).find(m => m.name.toLowerCase().includes('run'));
      if (!runMov) {
        issues.push('Partner together run: Run not found');
      }
      // Run should remain together=true after post-processing
      const ex = p.exercises[0];
      const runInEx = ex.movements?.find(m => m.name.toLowerCase().includes('run'));
      if (runInEx && !runInEx.together) {
        issues.push('Partner together run: Run.together should remain true after post-process');
      }
    },
  },

  // ── 7. EMOM 12 — alternating 2 movements ─────────────────────────────────────
  {
    name: 'EMOM 12 — alternating 2 movements',
    workout: {
      title: 'EMOM 12',
      type: 'emom',
      format: 'emom',
      scoreType: 'pass_fail',
      timeCap: 720,
      exercises: [{
        name: 'EMOM 12',
        type: 'wod',
        prescription: 'EMOM 12: Odd: 15 Cal Row, Even: 10 Hang Power Clean @60kg',
        suggestedSets: 12,
        loggingMode: 'emom',
        movements: [
          { name: 'Row', calories: 15, stationLabel: 'Min 1', countingMode: 'per_station_visit' },
          { name: 'Hang Power Clean', reps: 10, rxWeights: { male: 60, female: 40, unit: 'kg' }, stationLabel: 'Min 2', countingMode: 'per_station_visit' },
        ],
      }],
    },
    checks: (_p, wb, issues) => {
      // 12 min EMOM, 2 stations → 6 visits each
      // Row: 15 cal × 6 = 90 cal
      expectCalories(wb, 'Row', 90, issues, 'EMOM 12');
      // HPC: 10 reps × 6 = 60 reps
      expectReps(wb, 'Hang Power Clean', 60, issues, 'EMOM 12');
    },
  },

  // ── 8. Strength 5x5 Back Squat ────────────────────────────────────────────────
  {
    name: 'Strength 5x5 Back Squat',
    workout: {
      title: 'Back Squat 5x5',
      type: 'strength',
      format: 'strength',
      scoreType: 'load',
      exercises: [{
        name: 'Back Squat',
        type: 'strength',
        prescription: '5x5 @ 100kg',
        suggestedSets: 5,
        suggestedReps: 5,
        suggestedWeight: 100,
        rxWeights: { male: 100, female: 70, unit: 'kg' },
        loggingMode: 'strength',
      }],
    },
    checks: (_p, wb, issues) => {
      if (wb.grandTotalVolume <= 0) issues.push('Strength 5x5: volume should be > 0');
      // No movements means exercise-level fallback — check exercise exists in movements list
      if (wb.movements.length === 0) issues.push('Strength 5x5: no movements in breakdown');
    },
  },

  // ── 9. 5 sets for time (intervals) — run + barbell ───────────────────────────
  {
    name: '5 sets for time (intervals)',
    workout: {
      title: '5 Sets For Time',
      type: 'for_time',
      format: 'intervals',
      scoreType: 'time_per_set',
      exercises: [{
        name: '5 Sets For Time',
        type: 'wod',
        prescription: '5 sets for time: 400m Run, 10 Power Clean @70kg',
        suggestedSets: 5,
        loggingMode: 'intervals',
        movements: [
          { name: 'Run', distance: 400, unit: 'm' },
          { name: 'Power Clean', reps: 10, rxWeights: { male: 70, female: 50, unit: 'kg' } },
        ],
      }],
    },
    checks: (_p, wb, issues) => {
      // 400m × 5 = 2000m
      expectDistance(wb, 'Run', 2000, issues, 'Intervals 5 sets');
      // 10 × 5 = 50 reps
      expectReps(wb, 'Power Clean', 50, issues, 'Intervals 5 sets');
    },
  },

  // ── 10. Chipper for time — 5 movements, suggestedSets:1 ──────────────────────
  {
    name: 'Chipper for time — 5 movements',
    workout: {
      title: 'Chipper',
      type: 'for_time',
      format: 'for_time',
      scoreType: 'time',
      exercises: [{
        name: 'Chipper',
        type: 'wod',
        prescription: 'For time: 50 Wall Ball, 40 Box Jump, 30 Toes to Bar, 20 Deadlift @100kg, 10 Muscle-up',
        suggestedSets: 1,
        loggingMode: 'for_time',
        movements: [
          { name: 'Wall Ball', reps: 50, rxWeights: { male: 9, female: 6, unit: 'kg' } },
          { name: 'Box Jump', reps: 40, isBodyweight: true },
          { name: 'Toes to Bar', reps: 30, isBodyweight: true },
          { name: 'Deadlift', reps: 20, rxWeights: { male: 100, female: 70, unit: 'kg' } },
          { name: 'Muscle-up', reps: 10, isBodyweight: true },
        ],
      }],
    },
    checks: (_p, wb, issues) => {
      expectReps(wb, 'Wall Ball', 50, issues, 'Chipper');
      expectReps(wb, 'Deadlift', 20, issues, 'Chipper');
      expectReps(wb, 'Muscle-up', 10, issues, 'Chipper');
      if (wb.grandTotalReps !== 150) {
        issues.push(`Chipper: grandTotalReps expected 150, got ${wb.grandTotalReps}`);
      }
    },
  },

  // ── 11. 21-15-9 (variable rep scheme) ────────────────────────────────────────
  {
    name: '21-15-9 Thruster + Pull-up',
    workout: {
      title: 'Fran',
      type: 'for_time',
      format: 'for_time',
      scoreType: 'time',
      benchmarkName: 'Fran',
      exercises: [{
        name: 'Fran',
        type: 'wod',
        prescription: '21-15-9: Thruster 43/29kg, Pull-up',
        suggestedSets: 3,
        suggestedRepsPerSet: [21, 15, 9],
        loggingMode: 'for_time',
        movements: [
          { name: 'Thruster', reps: 21, rxWeights: { male: 43, female: 29, unit: 'kg' } },
          { name: 'Pull-up', reps: 21, isBodyweight: true },
        ],
      }],
    },
    checks: (_p, wb, issues) => {
      // Thruster: sum of [21,15,9] = 45
      expectReps(wb, 'Thruster', 45, issues, '21-15-9');
      // Pull-up: sum of [21,15,9] = 45
      expectReps(wb, 'Pull-up', 45, issues, '21-15-9');
      if (wb.grandTotalReps !== 90) {
        issues.push(`21-15-9: grandTotalReps expected 90, got ${wb.grandTotalReps}`);
      }
    },
  },

  // ── 12. Ladder AMRAP — ascending reps [2,4,6,8,10] ───────────────────────────
  {
    name: 'Ladder AMRAP — ascending [2,4,6,8,10]',
    workout: {
      title: 'Ladder AMRAP 12',
      type: 'amrap',
      format: 'amrap',
      scoreType: 'rounds_reps',
      timeCap: 720,
      exercises: [{
        name: 'Ladder AMRAP 12',
        type: 'wod',
        prescription: 'AMRAP 12: 2-4-6-8-10 Clean and Jerk @60kg',
        suggestedSets: 1,
        loggingMode: 'amrap',
        ladderReps: [2, 4, 6, 8, 10],
        movements: [
          { name: 'Clean and Jerk', reps: 2, rxWeights: { male: 60, female: 42, unit: 'kg' } },
        ],
      }],
    },
    checks: (_p, wb, issues) => {
      // For a ladder AMRAP, workload is based on prescribed reps (first rung × 1 for estimation)
      if (wb.grandTotalReps <= 0) issues.push('Ladder AMRAP: should have some reps');
      // Clean and Jerk should exist
      const cj = wb.movements.find(m => m.name.toLowerCase().includes('clean'));
      if (!cj) issues.push('Ladder AMRAP: Clean and Jerk not in breakdown');
    },
  },

  // ── 13. Lion's Roar — for_time, Echo Bike buy-in + 2 round blocks ─────────────
  {
    name: "Lion's Roar — buy-in + section blocks",
    workout: {
      title: "Lion's Roar",
      type: 'for_time',
      format: 'for_time',
      scoreType: 'time',
      timeCap: 2520, // 42 min
      exercises: [{
        name: "Lion's Roar",
        type: 'wod',
        prescription: '42min TC: 30 cal Echo Bike buy-in, 2 rounds: 10 Deadlift @100kg + 10 Hang Power Clean @70kg, 2 rounds: 10 Push Press @50kg + 15 TTB, 30 cal Echo Bike cash-out',
        suggestedSets: 1,
        loggingMode: 'for_time',
        sections: [
          {
            sectionType: 'buy_in',
            rounds: 1,
            movements: [{ name: 'Echo Bike', calories: 30, role: 'buy_in', perRound: false }],
          },
          {
            sectionType: 'rounds',
            rounds: 2,
            movements: [
              { name: 'Deadlift', reps: 10, rxWeights: { male: 100, female: 70, unit: 'kg' } },
              { name: 'Hang Power Clean', reps: 10, rxWeights: { male: 70, female: 50, unit: 'kg' } },
            ],
          },
          {
            sectionType: 'rounds',
            rounds: 2,
            movements: [
              { name: 'Push Press', reps: 10, rxWeights: { male: 50, female: 35, unit: 'kg' } },
              { name: 'Toes to Bar', reps: 15, isBodyweight: true },
            ],
          },
          {
            sectionType: 'cash_out',
            rounds: 1,
            movements: [{ name: 'Echo Bike', calories: 30, role: 'cash_out', perRound: false }],
          },
        ],
      }],
    },
    checks: (p, wb, issues) => {
      expectSectionType(p, 'buy_in', issues, "Lion's Roar");
      expectSectionType(p, 'cash_out', issues, "Lion's Roar");
      // Echo Bike: 30 (buy-in) + 30 (cash-out) = 60 cal total
      expectCalories(wb, 'Echo Bike', 60, issues, "Lion's Roar");
      // Deadlift: 10 × 2 = 20
      expectReps(wb, 'Deadlift', 20, issues, "Lion's Roar");
      // HPC: 10 × 2 = 20
      expectReps(wb, 'Hang Power Clean', 20, issues, "Lion's Roar");
      // Push Press: 10 × 2 = 20
      expectReps(wb, 'Push Press', 20, issues, "Lion's Roar");
      // TTB: 15 × 2 = 30
      expectReps(wb, 'Toes to Bar', 30, issues, "Lion's Roar");
    },
  },

  // ── 14. AMRAP alt A.1/A.2 (amrap_intervals) ──────────────────────────────────
  {
    name: 'AMRAP alt A.1/A.2 (amrap_intervals)',
    workout: {
      title: 'A.1/A.2 AMRAP intervals',
      type: 'amrap',
      format: 'amrap_intervals',
      scoreType: 'rounds_reps',
      sets: 4,
      exercises: [
        {
          name: 'A.1 AMRAP 4',
          type: 'wod',
          prescription: 'AMRAP 4: 5 Bar Muscle-up, 10 Front Squat @60kg',
          suggestedSets: 4,
          loggingMode: 'amrap_intervals',
          movements: [
            { name: 'Bar Muscle-up', reps: 5, isBodyweight: true },
            { name: 'Front Squat', reps: 10, rxWeights: { male: 60, female: 42, unit: 'kg' } },
          ],
        },
        {
          name: 'A.2 AMRAP 4',
          type: 'wod',
          prescription: 'AMRAP 4: 10 Box Jump, 15 KB Swing 32/24kg',
          suggestedSets: 4,
          loggingMode: 'amrap_intervals',
          movements: [
            { name: 'Box Jump', reps: 10, isBodyweight: true },
            { name: 'American Kettlebell Swing', reps: 15, rxWeights: { male: 32, female: 24, unit: 'kg' } },
          ],
        },
      ],
    },
    checks: (_p, wb, issues) => {
      if (wb.grandTotalReps <= 0) issues.push('A.1/A.2 AMRAP: should have reps');
      // All movements should be per_round or per_interval — none should be "once"
      const onceMoves = collectMovements(_p).filter(m => m.countingMode === 'once');
      if (onceMoves.length > 0) {
        issues.push(`A.1/A.2 AMRAP: unexpected once-movements (no buy-in here): ${onceMoves.map(m=>m.name).join(',')}`);
      }
    },
  },

  // ── 15. Cash-out only (RFT with 600m cash-out, no buy-in) ────────────────────
  {
    name: 'RFT with cash-out only (no buy-in)',
    workout: {
      title: 'RFT + cash-out',
      type: 'for_time',
      format: 'for_time',
      scoreType: 'time',
      exercises: [{
        name: 'RFT + cash-out',
        type: 'wod',
        prescription: '5 RFT: 12 Thruster @43kg, 12 Pull-up, then 600m Run cash-out',
        suggestedSets: 5,
        loggingMode: 'for_time',
        sections: [
          {
            sectionType: 'rounds',
            rounds: 5,
            movements: [
              { name: 'Thruster', reps: 12, rxWeights: { male: 43, female: 29, unit: 'kg' } },
              { name: 'Pull-up', reps: 12, isBodyweight: true },
            ],
          },
          {
            sectionType: 'cash_out',
            rounds: 1,
            movements: [{ name: 'Run', distance: 600, unit: 'm', role: 'cash_out', perRound: false }],
          },
        ],
      }],
    },
    checks: (p, wb, issues) => {
      expectSectionType(p, 'cash_out', issues, 'Cash-out only');
      // Run should be 600m once (cash-out)
      expectDistance(wb, 'Run', 600, issues, 'Cash-out only');
      // Thruster: 12 × 5 = 60
      expectReps(wb, 'Thruster', 60, issues, 'Cash-out only');
      // Pull-up: 12 × 5 = 60
      expectReps(wb, 'Pull-up', 60, issues, 'Cash-out only');
    },
  },

  // ── 16. AMRAP intervals no buy-in ────────────────────────────────────────────
  {
    name: 'AMRAP intervals no buy-in (3x5min)',
    workout: {
      title: '3x5min AMRAP',
      type: 'amrap',
      format: 'amrap_intervals',
      scoreType: 'rounds_reps',
      sets: 3,
      exercises: [{
        name: '3x5min AMRAP',
        type: 'wod',
        prescription: '3x5min AMRAP with 2min rest: 10 Wall Ball, 10 Pull-up, 200m Run',
        suggestedSets: 3,
        loggingMode: 'amrap_intervals',
        intervalCount: 3,
        movements: [
          { name: 'Wall Ball', reps: 10, rxWeights: { male: 9, female: 6, unit: 'kg' } },
          { name: 'Pull-up', reps: 10, isBodyweight: true },
          { name: 'Run', distance: 200, unit: 'm' },
        ],
      }],
    },
    checks: (_p, wb, issues) => {
      if (wb.grandTotalReps <= 0) issues.push('AMRAP intervals no buy-in: should have reps');
      // No once-counted movements expected
      const onceMoves = collectMovements(_p).filter(m => m.countingMode === 'once' && !m.role);
      if (onceMoves.length > 0) {
        issues.push(`AMRAP intervals no buy-in: unexpected once-movements: ${onceMoves.map(m=>m.name).join(',')}`);
      }
    },
  },

  // ── 17. Tabata — 20s on/10s off ──────────────────────────────────────────────
  {
    name: 'Tabata — 20s on/10s off (8 rounds)',
    workout: {
      title: 'Tabata Air Squat',
      type: 'metcon',
      format: 'tabata',
      scoreType: 'reps',
      timeCap: 240,
      exercises: [{
        name: 'Tabata Air Squat',
        type: 'wod',
        prescription: 'Tabata Air Squat — 8x (20s on / 10s off)',
        suggestedSets: 8,
        loggingMode: 'intervals',
        movements: [
          { name: 'Air Squat', reps: 15, isBodyweight: true },
        ],
      }],
    },
    checks: (_p, wb, issues) => {
      // 15 × 8 = 120 reps
      expectReps(wb, 'Air Squat', 120, issues, 'Tabata');
    },
  },

  // ── 18. Benchmark (Cindy) — containerRounds:7 ────────────────────────────────
  {
    name: 'Benchmark Cindy — 7 outer rounds',
    workout: {
      title: '7 Rounds of Cindy',
      type: 'amrap',
      format: 'amrap',
      scoreType: 'rounds_reps',
      benchmarkName: 'Cindy',
      containerRounds: 7,
      exercises: [{
        name: 'Cindy',
        type: 'wod',
        prescription: '7 rounds of Cindy (AMRAP 20): 5 Pull-up, 10 Push-up, 15 Air Squat',
        suggestedSets: 7,
        loggingMode: 'amrap',
        movements: [
          { name: 'Pull-up', reps: 5, isBodyweight: true },
          { name: 'Push-up', reps: 10, isBodyweight: true },
          { name: 'Air Squat', reps: 15, isBodyweight: true },
        ],
      }],
    },
    checks: (_p, wb, issues) => {
      // 5 × 7 = 35, 10 × 7 = 70, 15 × 7 = 105 → total 210
      expectReps(wb, 'Pull-up', 35, issues, 'Cindy 7 rounds');
      expectReps(wb, 'Push-up', 70, issues, 'Cindy 7 rounds');
      expectReps(wb, 'Air Squat', 105, issues, 'Cindy 7 rounds');
      if (wb.grandTotalReps !== 210) {
        issues.push(`Cindy: grandTotalReps expected 210, got ${wb.grandTotalReps}`);
      }
      if (wb.benchmarkName !== 'Cindy') {
        issues.push(`Cindy: benchmarkName missing from breakdown`);
      }
    },
  },

  // ── 19. Cardio metcon — Echo Bike max cal ────────────────────────────────────
  {
    name: 'Cardio metcon — Echo Bike max cal',
    workout: {
      title: 'Echo Bike Max Cal',
      type: 'metcon',
      format: 'for_time',
      scoreType: 'reps',
      timeCap: 600,
      exercises: [{
        name: 'Echo Bike Max Cal',
        type: 'cardio',
        prescription: '10min Echo Bike max cal',
        suggestedSets: 1,
        loggingMode: 'cardio',
        movements: [
          { name: 'Echo Bike', calories: 100, inputType: 'calories' },
        ],
      }],
    },
    checks: (_p, wb, issues) => {
      if (!wb.grandTotalCalories || wb.grandTotalCalories <= 0) {
        issues.push('Echo Bike max cal: grandTotalCalories should be > 0');
      }
      const bike = wb.movements.find(m => m.name.toLowerCase().includes('echo bike'));
      if (!bike) issues.push('Echo Bike max cal: Echo Bike not in movements');
    },
  },

  // ── 20. Mixed session — Strength block + Metcon block ────────────────────────
  {
    name: 'Mixed session — Strength + Metcon blocks',
    workout: {
      title: 'A) Strength / B) Metcon',
      type: 'mixed',
      format: 'strength',
      scoreType: 'load',
      exercises: [
        {
          name: 'A) Back Squat',
          type: 'strength',
          prescription: '4x6 @ 90kg',
          suggestedSets: 4,
          suggestedReps: 6,
          suggestedWeight: 90,
          rxWeights: { male: 90, female: 60, unit: 'kg' },
          loggingMode: 'strength',
        },
        {
          name: 'B) Metcon',
          type: 'wod',
          prescription: '3 RFT: 15 Toes to Bar, 200m Run, 12 KB Swing 32/24kg',
          suggestedSets: 3,
          loggingMode: 'for_time',
          movements: [
            { name: 'Toes to Bar', reps: 15, isBodyweight: true },
            { name: 'Run', distance: 200, unit: 'm' },
            { name: 'American Kettlebell Swing', reps: 12, rxWeights: { male: 32, female: 24, unit: 'kg' } },
          ],
        },
      ],
    },
    checks: (_p, wb, issues) => {
      // Squat exercise-level fallback: 6 × 4 = 24 reps, weight 90kg → volume 2160 kg
      const squat = wb.movements.find(m => m.name.toLowerCase().includes('squat'));
      if (!squat) {
        issues.push('Mixed: Back Squat not in workload breakdown');
      }
      // TTB: 15 × 3 = 45
      expectReps(wb, 'Toes to Bar', 45, issues, 'Mixed session');
      // Run: 200 × 3 = 600m
      expectDistance(wb, 'Run', 600, issues, 'Mixed session');
      // KB Swing: 12 × 3 = 36
      expectReps(wb, 'American Kettlebell Swing', 36, issues, 'Mixed session');
    },
  },
];

// ── Run all fixtures ───────────────────────────────────────────────────────────

function printBanner() {
  console.log('\n' + '═'.repeat(70));
  console.log('  WODBOARD METCON LOGGING PIPELINE AUDIT');
  console.log('  20 fixture workouts — postProcess + workloadBreakdown');
  console.log('═'.repeat(70) + '\n');
}

function printResult(r: AuditResult) {
  const icon = r.pass ? '✅' : '❌';
  console.log(`[${String(r.index).padStart(2, ' ')}] ${icon}  ${r.name}`);
  console.log(`      Movements after post-process: ${r.movementsAfterProcess.join(', ')}`);
  const t = r.totals;
  const totParts: string[] = [`${t.reps} reps`];
  if (t.volume > 0) totParts.push(`${t.volume} kg vol`);
  if (t.distance) totParts.push(`${t.distance} m dist`);
  if (t.calories) totParts.push(`${t.calories} cal`);
  console.log(`      Workload totals: ${totParts.join(', ')}`);
  console.log(`      Buy-in/cash-out: ${r.buyInStatus}`);
  console.log(`      Hero: "${r.hero}"`);
  if (r.issues.length > 0) {
    for (const issue of r.issues) {
      console.log(`      ⚠️  Issue: ${issue}`);
    }
  } else {
    console.log(`      Issues: none`);
  }
  console.log();
}

function main() {
  printBanner();

  const results = fixtures.map((f, i) =>
    runAudit(i + 1, f.name, f.workout, f.checks)
  );

  for (const r of results) {
    printResult(r);
  }

  const passing = results.filter(r => r.pass).length;
  const failing = results.filter(r => !r.pass).length;

  console.log('═'.repeat(70));
  console.log(`  SUMMARY: ${passing} ✅ passing  |  ${failing} ❌ failing  (out of ${results.length})`);
  if (failing > 0) {
    console.log('\n  Failed fixtures:');
    results.filter(r => !r.pass).forEach(r => {
      console.log(`    [${r.index}] ${r.name}`);
      r.issues.forEach(issue => console.log(`         - ${issue}`));
    });
  }
  console.log('═'.repeat(70) + '\n');
}

main();
