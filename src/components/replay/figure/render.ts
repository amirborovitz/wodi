/**
 * Paints a Frame into an SVG group, sixty times a second.
 *
 * The elements are made once and only their coordinates change, so a frame costs a few dozen
 * attribute writes and React never re-renders for it. Colours come from the app's tokens.
 */

import { BIKE, ROWER } from './moves';
import type { Frame } from './moves';
import { BONES, STAGE, add, skeleton, vec } from './skeleton';
import type { Point } from './skeleton';
import type { MovementImplement } from '../../../data/movementRegistry';

const NS = 'http://www.w3.org/2000/svg';
const NEAR = 'var(--wodi-yellow)';
const FAR = 'color-mix(in srgb, var(--wodi-yellow) 45%, var(--wodi-bg))';
const KIT = 'var(--wodi-white)';
const RIG = 'var(--wodi-dim2)';
const FLOOR_MARKS = 8;

type Attrs = Record<string, string | number>;

function make(parent: SVGElement, tag: string, attrs: Attrs, style: Partial<CSSStyleDeclaration> = {}): SVGElement {
  const el = document.createElementNS(NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  Object.assign(el.style, style);
  parent.appendChild(el);
  return el;
}

const set = (el: SVGElement, attrs: Attrs): void => {
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
};
const show = (el: SVGElement, on: boolean): void => { el.style.display = on ? '' : 'none'; };
const segment = (el: SVGElement, a: Point, b: Point): void => set(el, { x1: a[0], y1: a[1], x2: b[0], y2: b[1] });

export interface FigurePainter { paint: (frame: Frame, implement: MovementImplement) => void }

export function createFigurePainter(root: SVGGElement): FigurePainter {
  root.replaceChildren();
  const line = (stroke: string, width: number, parent: SVGElement = root): SVGElement =>
    make(parent, 'line', { 'stroke-width': width, 'stroke-linecap': 'round' }, { stroke });
  const group = (): SVGElement => make(root, 'g', {});

  // ── behind the athlete ──
  make(root, 'line', { x1: 30, y1: STAGE.ground, x2: 270, y2: STAGE.ground, 'stroke-width': 2 }, { stroke: 'var(--wodi-line2)' });
  const floorMarks = group();
  const marks = Array.from({ length: FLOOR_MARKS }, () => line(RIG, 3, floorMarks));

  const pullBar = group();
  line(KIT, 4, pullBar); line(RIG, 4, pullBar); line(RIG, 4, pullBar);
  segment(pullBar.children[0] as SVGElement, [96, 30], [204, 30]);
  segment(pullBar.children[1] as SVGElement, [100, 30], [100, 0]);
  segment(pullBar.children[2] as SVGElement, [200, 30], [200, 0]);

  const box = make(root, 'rect', { x: 190, y: STAGE.ground - 56, width: 60, height: 56, rx: 4, 'stroke-width': 3 }, { fill: 'none', stroke: KIT });

  const rower = group();
  segment(line(RIG, 5, rower), [56, ROWER.rail], [256, ROWER.rail]);
  make(rower, 'circle', { cx: ROWER.flywheel[0], cy: ROWER.flywheel[1], r: 20, 'stroke-width': 3 }, { fill: 'none', stroke: KIT });
  const seat = make(rower, 'rect', { width: 26, height: 6, rx: 3 }, { fill: RIG });
  const chain = line(KIT, 2, rower);

  const bike = group();
  make(bike, 'circle', { cx: BIKE.fan[0], cy: BIKE.fan[1], r: 26, 'stroke-width': 3 }, { fill: 'none', stroke: KIT });
  segment(line(RIG, 5, bike), [BIKE.seat[0], BIKE.seat[1] + 8], BIKE.crank);
  segment(line(RIG, 5, bike), BIKE.crank, BIKE.fan);
  segment(line(RIG, 4, bike), [BIKE.fan[0] - 10, BIKE.fan[1] - 22], [BIKE.handle[0] - 6, BIKE.handle[1] + 6]);
  make(bike, 'rect', { x: BIKE.seat[0] - 14, y: BIKE.seat[1] + 4, width: 28, height: 6, rx: 3 }, { fill: RIG });
  const crankArm = line(KIT, 3, bike);

  const skiErg = group();
  segment(line(RIG, 6, skiErg), [210, STAGE.ground], [210, 18]);
  const cords = [line(KIT, 1.5, skiErg), line(KIT, 1.5, skiErg)];

  const rope = make(root, 'path', { 'stroke-width': 2, fill: 'none' }, { stroke: KIT });
  const shadow = make(root, 'ellipse', { cy: STAGE.ground + 1, rx: 26, ry: 4 }, { fill: 'var(--wodi-bg)' });

  // ── the athlete: far limbs, near legs, body, head, near arm ──
  const uaB = line(FAR, 9), faB = line(FAR, 8), thB = line(FAR, 11), shB = line(FAR, 10);
  const thF = line(NEAR, 11), shF = line(NEAR, 10);
  const torso = line(NEAR, 15);
  const head = make(root, 'circle', { r: BONES.head }, { fill: NEAR });
  const uaF = line(NEAR, 9), faF = line(NEAR, 8);

  // ── in the hands ──
  // Seen from the side, a bar and a dumbbell both point straight at you: a plate, big or small.
  const plate = make(root, 'circle', { r: 17, 'stroke-width': 4 }, { fill: 'var(--wodi-bg)', stroke: KIT });
  const hub = make(root, 'circle', { r: 3 }, { fill: KIT });
  const dumbbell = make(root, 'circle', { r: 8, 'stroke-width': 3 }, { fill: 'var(--wodi-bg)', stroke: KIT });
  const kettlebell = make(root, 'circle', { r: 9 }, { fill: KIT });
  const ball = make(root, 'circle', { r: 12, 'stroke-width': 3 }, { fill: 'var(--wodi-bg)', stroke: KIT });

  function paint({ pose, props }: Frame, implement: MovementImplement): void {
    const s = skeleton(pose);
    segment(thB, s.hip, s.kneeB); segment(shB, s.kneeB, s.footB);
    segment(uaB, s.shoulder, s.elbowB); segment(faB, s.elbowB, s.handB);
    segment(thF, s.hip, s.kneeF); segment(shF, s.kneeF, s.footF);
    segment(torso, s.hip, s.shoulder);
    set(head, { cx: s.head[0], cy: s.head[1] });
    segment(uaF, s.shoulder, s.elbowF); segment(faF, s.elbowF, s.handF);

    const lowFoot = Math.max(s.footF[1], s.footB[1]);
    set(shadow, { cx: (s.footF[0] + s.footB[0]) / 2 });
    shadow.style.opacity = String(Math.max(0, 0.6 - (STAGE.ground - lowFoot) / 90));

    const load = props.held ? implement : null;
    show(plate, load === 'barbell'); show(hub, load === 'barbell');
    if (load === 'barbell') { set(plate, { cx: s.handF[0], cy: s.handF[1] }); set(hub, { cx: s.handF[0], cy: s.handF[1] }); }
    show(dumbbell, load === 'dumbbell');
    if (load === 'dumbbell') set(dumbbell, { cx: s.handF[0], cy: s.handF[1] });
    // A kettlebell hangs off the hand, past the end of the forearm.
    show(kettlebell, load === 'kettlebell');
    if (load === 'kettlebell') {
      const bell = add(s.handF, vec(pose.faF, 11));
      set(kettlebell, { cx: bell[0], cy: bell[1] });
    }

    show(ball, !!props.ball);
    if (props.ball) set(ball, { cx: props.ball[0], cy: props.ball[1] });

    show(pullBar, !!props.pullBar);
    show(box, !!props.box);

    show(rope, !!props.rope);
    if (props.rope) {
      // A loop, not a stick: the two strands bow apart on their way out to the far end.
      const tip = props.rope;
      const strand = (hand: Point, side: number): Point => {
        const v: Point = [tip[0] - hand[0], tip[1] - hand[1]];
        return [hand[0] + v[0] * 0.5 - v[1] * 0.28 * side, hand[1] + v[1] * 0.5 + v[0] * 0.28 * side];
      };
      const out = strand(s.handF, 1);
      const back = strand(s.handB, -1);
      set(rope, { d: `M${s.handF[0]},${s.handF[1]} Q${out[0]},${out[1]} ${tip[0]},${tip[1]} Q${back[0]},${back[1]} ${s.handB[0]},${s.handB[1]}` });
    }

    show(rower, !!props.rower);
    if (props.rower) {
      set(seat, { x: s.hip[0] - 13, y: ROWER.seat + 6 });
      segment(chain, props.rower.handle, ROWER.flywheel);
    }

    show(bike, !!props.bike);
    if (props.bike) {
      const q = props.bike.crank;
      const r = BIKE.crankRadius;
      segment(crankArm, [BIKE.crank[0] - r * Math.cos(q), BIKE.crank[1] - r * Math.sin(q)], [BIKE.crank[0] + r * Math.cos(q), BIKE.crank[1] + r * Math.sin(q)]);
    }

    show(skiErg, !!props.skiErg);
    if (props.skiErg) { segment(cords[0], [210, 22], s.handF); segment(cords[1], [210, 22], s.handB); }

    show(floorMarks, props.floorScroll !== undefined);
    if (props.floorScroll !== undefined) {
      const offset = props.floorScroll % 34;
      marks.forEach((m, i) => {
        const x = 30 + i * 34 - offset;
        segment(m, [x, STAGE.ground + 10], [x + 10, STAGE.ground + 10]);
      });
    }
  }

  return { paint };
}
