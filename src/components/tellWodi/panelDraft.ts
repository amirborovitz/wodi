import { suggestPeak } from '../../utils/peakSuggestion';
import { panelAnswer, panelFieldKey, type ChatChip, type ChatPanel, type ChatPanelField, type ChatPanelGroup, type SlotAnswer } from './chatQuestions';

/**
 * What's entered on a chat card until it's sent — plain data, changed only by the pure steps
 * below, so the dock can work out the answer a tap makes BEFORE React commits it (a chip on the
 * last step sends at once).
 */
export interface PanelDraftState {
  /** Every field's number, by panelFieldKey. */
  values: Readonly<Record<string, number | undefined>>;
  /** Loads answered "No weight", by slot. */
  unloaded: ReadonlySet<string>;
  /** The side picked on each either/or, by its choice slot — the board's side until tapped. */
  picked: Readonly<Record<string, string>>;
  /** The peak was set by hand (or started on last time): the start stops suggesting it. */
  peakTouched: boolean;
}

export type PanelReply = { label: string; answers: SlotAnswer[] };

const slotOf = (group: ChatPanelGroup): string => group.fields[0].slotId;

const without = (set: ReadonlySet<string>, id: string): ReadonlySet<string> => new Set([...set].filter((x) => x !== id));

/**
 * Where a card starts: each load on its starting numbers (last time's load) or empty, and on
 * "No weight" where last time had none. A card that started on last time keeps last time's peak —
 * a real number they lifted, not one to recompute.
 */
export function initialDraft(panel: ChatPanel): PanelDraftState {
  return {
    values: Object.assign({}, ...panel.groups.map((g) => g.start)),
    unloaded: new Set(panel.groups.filter((g) => g.noLoad?.start).map(slotOf)),
    picked: {},
    peakTouched: panel.groups.some((g) => Object.keys(g.start).length > 0),
  };
}

/**
 * One number set. On an empty card, setting the start suggests the peak until the peak is touched
 * — the standard screen's rule (utils/peakSuggestion). A weight given is a load after all.
 */
export function withField(state: PanelDraftState, group: ChatPanelGroup, field: ChatPanelField['field'], value: number | undefined): PanelDraftState {
  const box = group.fields.find((f) => f.field === field);
  if (!box) return state;
  const peak = group.fields.find((f) => f.field === 'weightEnd');
  const suggest = field === 'weight' && peak && !state.peakTouched;
  return {
    ...state,
    values: {
      ...state.values,
      [panelFieldKey(box)]: value,
      ...(suggest ? { [panelFieldKey(peak)]: value != null ? suggestPeak(value) : undefined } : {}),
    },
    unloaded: value != null ? without(state.unloaded, slotOf(group)) : state.unloaded,
    peakTouched: state.peakTouched || field === 'weightEnd',
  };
}

/** A group emptied — skipped: every box blank, and not "No weight" either. */
export function withoutGroup(state: PanelDraftState, group: ChatPanelGroup): PanelDraftState {
  return {
    ...state,
    values: { ...state.values, ...Object.fromEntries(group.fields.map((f) => [panelFieldKey(f), undefined])) },
    unloaded: without(state.unloaded, slotOf(group)),
  };
}

/**
 * A load's one-tap chip ("Same · 16 kg", "20 kg", "Hit the cap · 20:00"): fills that group's
 * boxes with what the chip says. The dock then moves on — the chip answered the whole group.
 */
export function withChip(state: PanelDraftState, group: ChatPanelGroup, chip: ChatChip): PanelDraftState {
  const given = chip.answers.find((a) => a.id === slotOf(group)) ?? chip.answers[0];
  if (!given) return state;
  const fill = group.fields.flatMap((f): [string, number][] => {
    const value = f.field === 'weightEnd' ? given.weightEnd ?? given.weight
      : f.field === 'weight' ? given.weight
      : f.field === 'count' ? given.count
      : f.field === 'minutes' ? (given.seconds != null ? Math.floor(given.seconds / 60) : null)
      : f.field === 'seconds' ? (given.seconds != null ? Math.round(given.seconds % 60) : null)
      : null;
    return value != null ? [[panelFieldKey(f), value]] : [];
  });
  if (fill.length === 0) return state;
  return {
    ...state,
    values: { ...state.values, ...Object.fromEntries(fill) },
    unloaded: without(state.unloaded, slotOf(group)),
    peakTouched: state.peakTouched || group.fields.some((f) => f.field === 'weightEnd'),
  };
}

/** "No weight" on a load — its boxes empty: "no weight" and a number can't both be the answer. */
export function withNoLoad(state: PanelDraftState, group: ChatPanelGroup): PanelDraftState {
  const emptied = withoutGroup(state, group);
  return { ...emptied, unloaded: new Set([...emptied.unloaded, slotOf(group)]) };
}

export function withPick(state: PanelDraftState, group: ChatPanelGroup, option: string): PanelDraftState {
  return group.choice ? { ...state, picked: { ...state.picked, [group.choice.slotId]: option } } : state;
}

/** The card as an answer: the words of the athlete's reply, and what it fills in. */
export function replyOf(panel: ChatPanel, state: PanelDraftState): PanelReply {
  return panelAnswer(panel, state.values, state.unloaded, state.picked);
}

/** Has this group an answer — a number in any box, or "No weight"? */
export function groupAnswered(state: PanelDraftState, group: ChatPanelGroup): boolean {
  return state.unloaded.has(slotOf(group)) || group.fields.some((f) => (state.values[panelFieldKey(f)] ?? 0) > 0);
}
