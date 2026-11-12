import { useRef, useState } from 'react';
import { stepOnGrid } from '../../utils/stepGrid';
import { panelFieldKey, type ChatChip, type ChatPanel, type ChatPanelField, type ChatPanelGroup } from './chatQuestions';
import {
  groupAnswered, initialDraft, replyOf, unitOf, weightLadder, withChip, withField, withNoLoad, withoutGroup, withPick, withUnit,
  type PanelDraftState, type PanelReply,
} from './panelDraft';
import type { LoadUnit } from '../../utils/loadUnits';

/** One answer the dock asks for: a number, or a finish time read as one. */
interface DockStep {
  group: ChatPanelGroup;
  groupIndex: number;
  /** Null for a clock: its minutes and seconds are one reading, typed "1724" → 17:24. */
  field: ChatPanelField | null;
}

/** A line on the card above the dock: one movement or load, filling in as it's answered. */
export interface DockRow {
  key: string;
  title: string;
  /** "60 → 65 kg", "12 cal", "17:24", "No weight" — null while unanswered. */
  value: string | null;
  active: boolean;
  /** Jump back to it. */
  open: () => void;
}

export interface DockTick {
  filled: boolean;
  active: boolean;
  open: () => void;
}

/** A one-tap answer for the step in the dock — filling it and moving on. */
export interface DockChip {
  label: string;
  on: boolean;
  tap: () => void;
}

/** One weight of a start → peak build, beside the other. */
export interface DockWeight {
  /** "start", "peak", "reps", "weight". */
  label: string;
  /** This box's own unit ("kg", "reps") — boxes side by side can differ. */
  unit: string;
  /** As typed or stepped; empty when there's none. */
  display: string;
  /** The one the pad types into. */
  active: boolean;
  select: () => void;
  minus: () => void;
  plus: () => void;
  /** Held −/+: two steps at once ("±2.5, hold for 5"). */
  jump: (direction: 1 | -1) => void;
}

/** A weight near where the box started, one tap to jump to it. */
export interface DockLadderStep {
  label: string;
  /** Where the box started — last time's weight. */
  last: boolean;
  on: boolean;
  tap: () => void;
}

export interface PanelDock {
  rows: DockRow[];
  ticks: DockTick[];
  /** "Echo Bike", "Back Squat · peak". */
  stepName: string;
  /** "2/5". */
  position: string;
  /** The number as it reads in the dock — empty when nothing is entered. */
  display: string;
  /** What an empty display shows, dim: "0", "0:00". */
  placeholder: string;
  unit: string;
  /** The board's either/or for this movement, in the dock's header. */
  choice: { labels: string[]; on: number; pick: (index: number) => void } | null;
  chips: DockChip[];
  /**
   * A stepped answer (every weight, and the max set): its boxes side by side, each with −/+ — null
   * on every other answer (one big number, the next on the next step).
   */
  pair: DockWeight[] | null;
  /** What reads between the side-by-side boxes: "→" (start → peak), "@" (reps @ weight). */
  pairJoiner: string;
  /** The weights around last time's, for the weight being entered ("35 · 37.5 · 40 LAST · 42.5 · 45"). */
  ladder: DockLadderStep[];
  /** kg ↔ lb beside the weight — null when this answer has no weight. */
  unitSwitch: { options: LoadUnit[]; on: LoadUnit; pick: (unit: LoadUnit) => void } | null;
  /** "." is a key: a weight can be 72.5. */
  decimal: boolean;
  press: (key: string) => void;
  backspace: () => void;
  canGoBack: boolean;
  goBack: () => void;
  /** "Next", or "Log" on the last step — the card above names every number it sends. */
  nextLabel: string;
  next: () => void;
  skip: () => void;
}

const formatClock = (minutes: number, seconds: number): string => `${minutes}:${String(seconds).padStart(2, '0')}`;

/** "1724" → "17:24", "5" → "0:05" — a time typed the way a microwave reads it. */
function clockFromDigits(digits: string): { minutes: number; seconds: number } {
  const padded = digits.padStart(3, '0');
  return { minutes: Number(padded.slice(0, -2)), seconds: Number(padded.slice(-2)) };
}

const MAX_DIGITS = 5;
const CLOCK_DIGITS = 4;

function stepsOf(panel: ChatPanel): DockStep[] {
  return panel.groups.flatMap((group, groupIndex): DockStep[] => (group.control === 'clock'
    ? [{ group, groupIndex, field: null }]
    : group.fields.map((field) => ({ group, groupIndex, field }))));
}

/** A group's answer in words, the way the card shows it — null while it has none. */
function groupValue(group: ChatPanelGroup, state: PanelDraftState): string | null {
  if (state.unloaded.has(group.fields[0].slotId)) return 'No weight';
  const read = (field: ChatPanelField): number | undefined => state.values[panelFieldKey(field)];
  if (group.control === 'clock') {
    const minutes = read(group.fields.find((f) => f.field === 'minutes')!) ?? 0;
    const seconds = read(group.fields.find((f) => f.field === 'seconds')!) ?? 0;
    return minutes > 0 || seconds > 0 ? formatClock(minutes + Math.floor(seconds / 60), seconds % 60) : null;
  }
  const given = group.fields.map((f) => ({ f, v: read(f) })).filter((x): x is { f: ChatPanelField; v: number } => x.v != null && x.v > 0);
  if (given.length === 0) return null;
  // A peak equal to the start is one weight, said once.
  const shown = given.length === 2 && given[0].v === given[1].v && given[1].f.field === 'weightEnd' ? [given[0]] : given;
  const unit = (f: ChatPanelField): string => unitOf(state, group, f);
  const sameUnit = shown.every((x) => unit(x.f) === unit(shown[0].f));
  const numbers = sameUnit
    ? `${shown.map((x) => x.v).join(` ${group.joiner} `)} ${unit(shown[0].f)}`
    : shown.map((x) => `${x.v} ${unit(x.f)}`).join(` ${group.joiner} `);
  return `${group.prefix}${numbers}`;
}

/** The title a group shows: the side picked on its either/or, else its name (and its kit). */
function groupTitle(group: ChatPanelGroup, state: PanelDraftState): string {
  if (group.choice) {
    const at = group.choice.options.indexOf(state.picked[group.choice.slotId] ?? group.choice.options[0]);
    return group.choice.labels[Math.max(0, at)];
  }
  return group.kit ? `${group.title} · ${group.kit}` : group.title;
}

/**
 * The dock: a chat card answered one number at a time on a pad of its own, never the phone's
 * keyboard — so the screen never jumps and the card above stays where the athlete left it.
 * Every answer is a step; a chip fills its group and moves on, and the last step sends. The card
 * fills in live, and any row or tick jumps back. Same answers as before (panelAnswer) — only the
 * way they're entered changed.
 */
export function usePanelDock(panel: ChatPanel, onSubmit: (reply: PanelReply) => void): PanelDock {
  const [state, setState] = useState<PanelDraftState>(() => initialDraft(panel));
  const [active, setActive] = useState(0);
  // What's typed on this step since it opened; null = the next key replaces what's shown.
  const [entry, setEntry] = useState<string | null>(null);
  const sentRef = useRef(false);

  const steps = stepsOf(panel);
  const step = steps[Math.min(active, steps.length - 1)];
  const several = panel.groups.length > 1;

  const send = (next: PanelDraftState): void => {
    if (sentRef.current) return;
    sentRef.current = true;
    setState(next);
    onSubmit(replyOf(panel, next));
  };
  /** Land on a step (fresh: the first key replaces), or send when there's none left. */
  const go = (next: PanelDraftState, target: number): void => {
    if (target < 0 || target >= steps.length) {
      send(next);
      return;
    }
    setState(next);
    setActive(target);
    setEntry(null);
  };
  /** A weight's step in the unit it reads in now — switched kg ↔ lb, the other unit's step. */
  const weightStep = (group: ChatPanelGroup): number => {
    const setup = group.stepper;
    if (!setup) return 1;
    const weightField = group.fields.find((f) => f.field === 'weight' || f.field === 'weightEnd');
    const switched = weightField && state.units[weightField.slotId] && state.units[weightField.slotId] !== weightField.unit;
    return switched ? setup.altStep : setup.step;
  };
  const nextGroupStep = (): number => steps.findIndex((s) => s.groupIndex > step.groupIndex);

  const stepValue = (s: DockStep): number | undefined => (s.field ? state.values[panelFieldKey(s.field)] : undefined);
  const stepFilled = (s: DockStep): boolean => (s.field
    ? state.unloaded.has(s.group.fields[0].slotId) || (stepValue(s) ?? 0) > 0
    : groupAnswered(state, s.group));

  const display = ((): string => {
    if (!step) return '';
    if (!step.field) {
      if (entry != null) {
        if (entry === '') return '';
        const { minutes, seconds } = clockFromDigits(entry);
        return formatClock(minutes, seconds);
      }
      return groupValue(step.group, state) ?? '';
    }
    if (entry != null) return entry;
    const value = stepValue(step);
    return value != null && value > 0 ? String(value) : '';
  })();

  const apply = (text: string): void => {
    if (!step) return;
    if (!step.field) {
      const { minutes, seconds } = clockFromDigits(text);
      const empty = text === '';
      setState(withField(withField(state, step.group, 'minutes', empty ? undefined : minutes), step.group, 'seconds', empty ? undefined : seconds));
    } else {
      const value = Number(text);
      setState(withField(state, step.group, step.field.field, Number.isFinite(value) && value > 0 ? value : undefined));
    }
    setEntry(text);
  };

  const decimal = step?.field?.field === 'weight' || step?.field?.field === 'weightEnd';

  const chips = ((): DockChip[] => {
    if (!step) return [];
    const { group } = step;
    const firstOfGroup = step.field == null || step.field === group.fields[0];
    const fillAndMove = (next: PanelDraftState): void => go(next, nextGroupStep());
    const chipOf = (chip: ChatChip): DockChip => ({ label: chip.label, on: false, tap: () => fillAndMove(withChip(state, group, chip)) });
    if (!firstOfGroup) {
      // The peak: one weight for every set is one tap.
      const startField = group.fields.find((f) => f.field === 'weight');
      const start = startField ? state.values[panelFieldKey(startField)] : undefined;
      if (step.field?.field !== 'weightEnd' || start == null) return [];
      return [{
        label: `Same · ${start}`,
        on: stepValue(step) === start,
        tap: () => go(withField(state, group, 'weightEnd', start), active + 1),
      }];
    }
    const out: DockChip[] = [];
    // Last time, one tap — what the card started on, put back and moved past. A weight with −/+ has
    // it on its ladder instead, marked LAST.
    if (group.last && Object.keys(group.start).length > 0 && !group.stepper) {
      out.push({
        label: group.last,
        on: false,
        tap: () => fillAndMove(Object.entries(group.start).reduce<PanelDraftState>((s, [key, value]) => {
          const field = group.fields.find((f) => panelFieldKey(f) === key);
          return field ? withField({ ...s, peakTouched: true }, group, field.field, value) : s;
        }, state)),
      });
    }
    if (group.control === 'bells') {
      const field = group.fields[0];
      for (const size of group.sizes ?? []) {
        out.push({
          label: `${group.pair ? '2×' : ''}${size} ${field.unit}`,
          on: state.values[panelFieldKey(field)] === size,
          tap: () => fillAndMove(withField(state, group, 'weight', size)),
        });
      }
    }
    out.push(...group.quick.map(chipOf));
    if (group.noLoad) {
      out.push({ label: 'No weight', on: state.unloaded.has(group.fields[0].slotId), tap: () => fillAndMove(withNoLoad(state, group)) });
    }
    return out;
  })();

  // A stepped answer is ONE screen: its boxes side by side (start → peak, reps @ weight, or one
  // weight), each with −/+ — a weight on the grid it comes in (stepOnGrid), reps by one; the pad types
  // into the one tapped. An empty weight's + starts at the board's lightest Rx; an empty box's − does
  // nothing. A metcon still goes movement by movement.
  const pair = ((): DockWeight[] | null => {
    const setup = step?.group.stepper;
    if (!step || !setup) return null;
    return step.group.fields.map((field): DockWeight => {
      const index = steps.findIndex((s) => s.group === step.group && s.field === field);
      const here = steps[index] === step;
      const saved = state.values[panelFieldKey(field)];
      const isWeight = field.field === 'weight' || field.field === 'weightEnd';
      const by = isWeight ? weightStep(step.group) : 1;
      const move = (direction: 1 | -1, times = 1): void => {
        const typed = here && entry ? Number(entry) : undefined;
        const current = typed != null && Number.isFinite(typed) && typed > 0 ? typed : saved;
        const next = current != null && current > 0
          ? Math.max(0, isWeight ? stepOnGrid(current, direction, by * times) : current + direction * times)
          : direction > 0 ? (isWeight ? setup.base ?? by : by) : undefined;
        setState(withField(state, step.group, field.field, next != null && next > 0 ? next : undefined));
        if (here) setEntry(null);
      };
      return {
        label: field.label,
        unit: unitOf(state, step.group, field),
        display: here ? display : saved != null && saved > 0 ? String(saved) : '',
        active: here,
        select: () => { if (!here) go(state, index); },
        minus: () => move(-1),
        plus: () => move(1),
        jump: (direction) => move(direction, 2),
      };
    });
  })();

  // The weights around where this weight started (last time, else the board's Rx): one tap jumps
  // there and stays — Next moves on.
  const ladder = ((): DockLadderStep[] => {
    const field = step?.field;
    if (!step || !field || !step.group.stepper || (field.field !== 'weight' && field.field !== 'weightEnd')) return [];
    const last = step.group.start[panelFieldKey(field)];
    const center = last ?? step.group.stepper.base;
    if (center == null || center <= 0) return [];
    const value = entry ? Number(entry) : state.values[panelFieldKey(field)];
    return weightLadder(center, weightStep(step.group)).map((w) => ({
      label: String(w),
      last: last != null && w === last,
      on: value === w,
      tap: () => { setState(withField(state, step.group, field.field, w)); setEntry(null); },
    }));
  })();

  // kg ↔ lb beside a weight: the unit they lifted in, the number unchanged.
  const unitSwitch = ((): PanelDock['unitSwitch'] => {
    const group = step?.group;
    const weightField = group?.stepper ? group.fields.find((f) => f.field === 'weight' || f.field === 'weightEnd') : undefined;
    if (!group || !weightField) return null;
    const on = unitOf(state, group, weightField);
    if (on !== 'kg' && on !== 'lb') return null;
    return { options: ['kg', 'lb'], on, pick: (unit) => setState(withUnit(state, group, unit)) };
  })();

  // One tick per answer the athlete sees: a start → peak build is one, however many boxes it holds.
  const shownSteps = steps
    .map((s, index) => ({ s, index }))
    .filter(({ s }) => !(s.group.stepper && s.field !== s.group.fields[0]));
  const shownAt = shownSteps.findIndex(({ s }) => s.groupIndex === step?.groupIndex);

  const name = step ? (several ? groupTitle(step.group, state) : panel.title) : '';

  return {
    rows: panel.groups.map((group, index) => ({
      key: `${group.title}:${index}`,
      title: groupTitle(group, state),
      value: groupValue(group, state),
      active: step?.groupIndex === index,
      open: () => go(state, steps.findIndex((s) => s.groupIndex === index)),
    })),
    // One answer has nothing to show progress through.
    ticks: shownSteps.length < 2 ? [] : shownSteps.map(({ s, index }) => ({
      filled: steps.filter((x) => x.group === s.group).every(stepFilled),
      active: s.groupIndex === step?.groupIndex,
      open: () => go(state, index),
    })),
    stepName: step?.field && step.group.fields.length > 1 && !pair ? `${name} · ${step.field.label}` : name,
    position: `${shownAt + 1}/${shownSteps.length}`,
    display,
    placeholder: step && !step.field ? '0:00' : '0',
    unit: step?.field?.unit ?? '',
    choice: step?.group.choice ? {
      labels: step.group.choice.labels,
      on: Math.max(0, step.group.choice.options.indexOf(state.picked[step.group.choice.slotId] ?? step.group.choice.options[0])),
      pick: (index) => setState(withPick(state, step.group, step.group.choice!.options[index])),
    } : null,
    chips,
    pair,
    pairJoiner: step?.group.joiner ?? '→',
    ladder,
    unitSwitch,
    decimal,
    press: (key) => {
      if (!step) return;
      const typed = entry ?? '';
      if (!step.field) {
        if (!/\d/.test(key) || typed.length >= CLOCK_DIGITS) return;
        apply(typed + key);
        return;
      }
      if (key === '.' && (!decimal || typed.includes('.'))) return;
      if (typed.replace('.', '').length >= MAX_DIGITS) return;
      apply(typed === '' && key === '.' ? '0.' : typed + key);
    },
    backspace: () => apply(entry == null ? '' : entry.slice(0, -1)),
    canGoBack: active > 0,
    goBack: () => { if (active > 0) go(state, active - 1); },
    // The last tap names what it does. A start → peak build shows both weights at once, so Next
    // leaves the lift — the peak is a tap on its box, not another step.
    nextLabel: (pair ? nextGroupStep() < 0 : active >= steps.length - 1) ? 'Done' : 'Next',
    next: () => (pair ? go(state, nextGroupStep()) : go(state, active + 1)),
    skip: () => { if (step) go(withoutGroup(state, step.group), nextGroupStep()); },
  };
}
