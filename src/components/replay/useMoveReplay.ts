import { useCallback, useEffect, useRef, useState } from 'react';
import { createFigurePainter } from './figure/render';
import type { FigurePainter } from './figure/render';
import { REPLAY_TIMING, replayMomentAt } from './replayScript';
import type { ReplayBeat, ReplayScript } from './replayScript';

export type ReplayOutcome = 'watched' | 'skipped';

export interface MoveReplayView {
  /** Hand to the stage's <g>: the athlete is drawn into it. */
  stageRef: (group: SVGGElement | null) => void;
  /** The line being performed; null before the first and once the result is up. */
  beat: ReplayBeat | null;
  beatIndex: number;
  /** The result counting up; null until it lands. */
  heroText: string | null;
  skip: () => void;
}

const easeOut = (k: number): number => 1 - (1 - k) ** 3;

/**
 * Plays one replay from the start, once. The athlete is painted straight into the SVG every
 * frame; React only hears about it when the line on screen changes or the result ticks, so
 * the frame rate never depends on a re-render.
 */
export function useMoveReplay(script: ReplayScript, onDone: (outcome: ReplayOutcome) => void): MoveReplayView {
  const painter = useRef<FigurePainter | null>(null);
  const finished = useRef(false);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);
  const [beatIndex, setBeatIndex] = useState(-1);
  const [heroText, setHeroText] = useState<string | null>(null);

  const stageRef = useCallback((group: SVGGElement | null) => {
    painter.current = group ? createFigurePainter(group) : null;
    const first = replayMomentAt(script, 0);
    painter.current?.paint(first.frame, first.implement);
  }, [script]);

  const finish = useCallback((outcome: ReplayOutcome) => {
    if (finished.current) return;
    finished.current = true;
    done.current(outcome);
  }, []);

  useEffect(() => {
    finished.current = false;
    let raf = 0;
    let last: number | null = null;
    let t = 0;
    let shownBeat = -1;
    let shownHero: string | null = null;

    const tick = (now: number): void => {
      // Time advances with frames, capped per frame: a backgrounded tab pauses the replay
      // instead of jumping to its end.
      t += last === null ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;
      const moment = replayMomentAt(script, t);
      painter.current?.paint(moment.frame, moment.implement);
      if (moment.beat !== shownBeat) { shownBeat = moment.beat; setBeatIndex(moment.beat); }
      const hero = script.hero;
      const text = hero && t >= hero.at ? hero.countUp(easeOut(Math.min(1, (t - hero.at) / REPLAY_TIMING.count))) : null;
      if (text !== shownHero) { shownHero = text; setHeroText(text); }
      if (moment.finished) { finish('watched'); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [script, finish]);

  return {
    stageRef,
    beat: beatIndex >= 0 && heroText === null ? script.beats[beatIndex] ?? null : null,
    beatIndex,
    heroText,
    skip: () => finish('skipped'),
  };
}
