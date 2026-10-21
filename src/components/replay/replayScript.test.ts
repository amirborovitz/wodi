import { describe, expect, it } from 'vitest';
import type { PosterLine, PosterRow, PosterWod } from '../celebration/faces/HandwrittenFace/posterData';
import { MOVES, moveForMovement } from './figure/moves';
import { REPLAY_TIMING, buildReplayScript, heroCountUp, lineSizeFor, replayMomentAt } from './replayScript';

const line = (rx: string, extra: Partial<PosterLine> = {}): PosterLine =>
  ({ kind: 'line', rx, load: '', mine: '', team: '', ...extra });

/** A PosterWod as buildPosterWod leaves it: the rows ride on the hidden field rowsOf reads. */
function wod(rows: PosterRow[], result: PosterWod['result'] = { label: 'MY TIME', value: '9:42' }): PosterWod {
  const base: PosterWod = {
    type: 'FOR TIME', title: null, date: 'OCT 17 26', format: '3 ROUNDS', sub: '',
    blocks: [], result, rx: null, totals: [], ep: 148, teamSize: 1, isPartnerConfirmed: false, split: 'reps',
  };
  return Object.assign(base, { _rows: rows });
}

describe('buildReplayScript', () => {
  it('performs each line of the poster, in its order and its words', () => {
    const script = buildReplayScript(wod([
      line('15 Thruster', { load: '43/30kg', mine: '43kg' }),
      line('10 Pull-up'),
      line('400m Run'),
    ]));
    expect(script.beats.map((b) => [b.text, b.detail, b.move])).toEqual([
      ['15 Thruster', '43kg', 'thruster'],
      ['10 Pull-up', '', 'pullUp'],
      ['400m Run', '', 'run'],
    ]);
    expect(script.eyebrow).toBe('FOR TIME · 3 ROUNDS');
  });

  it("shows the board's load when the athlete didn't enter one", () => {
    const [beat] = buildReplayScript(wod([line('10 Deadlift', { load: '100/70kg' })])).beats;
    expect(beat.detail).toBe('100/70kg');
  });

  it('plays a movement once even when the poster repeats it round after round', () => {
    const script = buildReplayScript(wod([
      { kind: 'block', label: 'ROUND 1' },
      line('10 Burpee', { roundLabel: 'R1' }),
      line('10 Burpee', { roundLabel: 'R2' }),
      line('10 burpee ', { roundLabel: 'R3' }),
    ]));
    expect(script.beats).toHaveLength(1);
  });

  it('keeps a long chipper inside the same time, never past it', () => {
    const many = Array.from({ length: 12 }, (_, i) => line(`${i + 1} Movement ${i}`));
    const script = buildReplayScript(wod(many));
    expect(script.beats).toHaveLength(REPLAY_TIMING.maxBeats);
    const beatsTime = script.beats.reduce((sum, b) => sum + b.duration, 0);
    expect(beatsTime).toBeLessThanOrEqual(REPLAY_TIMING.maxBeats * REPLAY_TIMING.minBeat + 1e-9);
    const T = REPLAY_TIMING;
    expect(script.end).toBeCloseTo(T.intro + T.maxBeats * T.minBeat + T.count + T.hold, 6);
  });

  it('fits whole reps into every beat', () => {
    for (const beat of buildReplayScript(wod([line('15 Thruster'), line('400m Run')])).beats) {
      expect(Number.isInteger(beat.reps)).toBe(true);
      expect(beat.reps).toBeGreaterThanOrEqual(1);
    }
  });

  it('lands the hero on the poster’s own result', () => {
    const script = buildReplayScript(wod([line('21 Wall Ball')], { label: 'MY ROUNDS', value: '7+12' }));
    expect(script.hero?.value).toBe('7+12');
    expect(script.hero?.countUp(1)).toBe('7+12');
    expect(script.hero?.at).toBe(script.finishAt);
  });

  it('prints several independent scores as written, side by side, with no count', () => {
    const script = buildReplayScript(wod([line('5 Clean')], {
      label: 'SCORES', value: '', scores: [{ label: 'A', value: '6+3' }, { label: 'B', value: '5+10' }],
    }));
    expect(script.hero?.countUp(0)).toBe('6+3 · 5+10');
  });

  it('has no hero when the poster has no result', () => {
    expect(buildReplayScript(wod([line('5 Clean')], { label: '', value: '' })).hero).toBeNull();
  });
});

describe('lineSizeFor', () => {
  it('keeps short lines at full size', () => {
    expect(lineSizeFor(['15 Thruster', '400m Run'])).toBe(12);
  });

  it('shrinks a long movement name to two rows instead of spilling over the athlete', () => {
    const size = lineSizeFor(['20 Single Dumbbell Hang Clean and Jerks']);
    expect(size).toBeLessThan(12);
    expect(size).toBeGreaterThanOrEqual(8);
  });

  it('sizes every line of a replay by its longest, so the type never jumps between lines', () => {
    const script = buildReplayScript(wod([line('10 Pull-up'), line('20 Single Dumbbell Hang Clean and Jerks')]));
    expect(script.lineSize).toBe(lineSizeFor(['20 Single Dumbbell Hang Clean and Jerks']));
  });
});

describe('heroCountUp', () => {
  it('counts a time through its seconds and ends exactly on it', () => {
    const count = heroCountUp('9:42');
    expect(count(0)).toBe('0:00');
    expect(count(0.5)).toBe('4:51');
    expect(count(1)).toBe('9:42');
  });

  it('counts the rounds of a rounds+reps score and adds the reps on arrival', () => {
    const count = heroCountUp('7+12');
    expect(count(0.5)).toBe('4');
    expect(count(1)).toBe('7+12');
  });

  it('counts a weight and keeps its unit', () => {
    const count = heroCountUp('102.5kg');
    expect(count(0)).toBe('0.0kg');
    expect(count(1)).toBe('102.5kg');
  });

  it('shows anything else as written from the first frame', () => {
    expect(heroCountUp('DNF')(0)).toBe('DNF');
    expect(heroCountUp('1,250 m')(0.3)).toBe('1,250 m');
  });
});

describe('moveForMovement', () => {
  it.each([
    ['15 Thrusters', 'thruster'],
    ['21 Pull-ups', 'pullUp'],
    ['400m Run', 'run'],
    ['12 Cal Echo Bike', 'bike'],
    ['15 Cal Row', 'row'],
    ['Wall Ball Shots', 'wallBall'],
    ['Double-unders', 'jumpRope'],
    ['KB Swings', 'swing'],
    ['Box jump overs', 'boxJump'],
    ['Hang Power Snatch', 'snatch'],
  ])('%s → %s', (name, move) => {
    expect(moveForMovement(name).move).toBe(move);
  });

  it('draws a barbell row as the ready stance, not the rower', () => {
    expect(moveForMovement('Bent-over Barbell Row').move).toBe('work');
  });

  it("draws a movement it doesn't know as the ready stance — never a different movement", () => {
    expect(moveForMovement('Zercher Carry Something').move).toBe('work');
  });

  it.each([
    ['5 Front Squat', 'frontSquat', 'barbell'],
    ['10 DB Front Squats', 'frontSquat', 'dumbbell'],
    ['KB Front Squat', 'frontSquat', 'kettlebell'],
    ['Back Squat', 'backSquat', 'barbell'],
    ['Overhead Squat', 'overheadSquat', 'barbell'],
    ['Goblet Squat', 'gobletSquat', 'kettlebell'],
    ['20 Air Squats', 'squat', 'bodyweight'],
    ['DB Thrusters', 'thruster', 'dumbbell'],
  ])('a squat or a lift is held where the board puts the load: %s', (name, move, implement) => {
    expect(moveForMovement(name)).toMatchObject({ move, implement });
  });

  it.each([
    ['KB Snatch', 'kbSnatch', 'kettlebell'],
    ['Single Arm Kettlebell Snatch', 'kbSnatch', 'kettlebell'],
    ['DB Snatch', 'dbSnatch', 'dumbbell'],
    ['Alternating Dumbbell Snatches', 'dbSnatch', 'dumbbell'],
    ['Hang Power Snatch', 'snatch', 'barbell'],
  ])('a snatch is drawn the way its implement is lifted: %s', (name, move, implement) => {
    expect(moveForMovement(name)).toMatchObject({ move, implement });
  });

  it.each([
    ['KB Snatch', '', 'one'],
    ['DB Snatch', '22.5kg', 'one'],
    ['Double KB Snatch', '', 'pair'],
    ['Twin DB Snatch', '', 'pair'],
    ['DB Snatch', '2×22.5kg', 'pair'],
    ['DB Thrusters', '', 'one'],
    ['Power Snatch', '60kg', 'shared'],
    ['KB Swings', '24kg', 'shared'],
    ['Goblet Squat', '', 'shared'],
  ])('one bell works one arm, a pair works both: %s %s → %s', (name, load, hands) => {
    expect(moveForMovement(name, load).hands).toBe(hands);
  });
});

describe('replayMomentAt', () => {
  const script = buildReplayScript(wod([line('15 Thruster'), line('10 Pull-up')]));

  it('leaves the far arm free on a one-bell line and works both arms on a pair', () => {
    const at = (rx: string, mine: string) => {
      const s = buildReplayScript(wod([line(rx, { mine })]));
      // Mid-beat, the snatch has the bell overhead.
      return replayMomentAt(s, s.beats[0].at + s.beats[0].duration * 0.6 / s.beats[0].reps);
    };
    const single = at('10 KB Snatch', '24kg');
    const pair = at('10 KB Snatch', '2×24kg');
    expect(single.hands).toBe('one');
    expect(single.frame.pose.uaB).toBeLessThan(0);
    expect(pair.hands).toBe('pair');
    expect(pair.frame.pose.uaB).toBeGreaterThan(90);
  });

  it('shows no line during the warm-up stance and after the last beat', () => {
    expect(replayMomentAt(script, 0).beat).toBe(-1);
    expect(replayMomentAt(script, script.finishAt + 0.5).beat).toBe(-1);
  });

  it('shows each line during its own beat', () => {
    expect(replayMomentAt(script, script.beats[0].at + 0.5).beat).toBe(0);
    expect(replayMomentAt(script, script.beats[1].at + 0.5).beat).toBe(1);
  });

  it('finishes at the end and not before', () => {
    expect(replayMomentAt(script, script.end - 0.01).finished).toBe(false);
    expect(replayMomentAt(script, script.end).finished).toBe(true);
  });

  it('draws a finite figure at every moment of every movement', () => {
    for (const move of Object.values(MOVES)) {
      for (let u = 0; u < 1; u += 0.05) {
        for (const value of Object.values(move.frame(u).pose)) expect(Number.isFinite(value)).toBe(true);
      }
    }
  });
});
