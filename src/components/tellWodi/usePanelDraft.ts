import { useState } from 'react';
import { suggestPeak } from '../../utils/peakSuggestion';
import { panelAnswer, panelFieldKey, type ChatChip, type ChatPanel, type ChatPanelField, type ChatPanelGroup, type SlotAnswer } from './chatQuestions';

export interface PanelDraft {
  /** Every field's number — set on a pill or typed into a box. */
  values: Readonly<Record<string, number | undefined>>;
  /** What's typed in each plain box, as typed. */
  drafts: Readonly<Record<string, string>>;
  /** A pill's number: a weight (setting the start suggests the peak), minutes or seconds. */
  setField: (group: ChatPanelGroup, field: ChatPanelField['field'], value: number | undefined) => void;
  setDraft: (key: string, text: string) => void;
  /** "Log 60 → 65 kg", "Log 17:24" — the button names exactly what it saves. */
  commitLabel: string;
  canSubmit: boolean;
  /** The card as an answer: the words of the athlete's reply, and what it fills in. */
  answer: () => { label: string; answers: SlotAnswer[] };
  /** Every group skipped. */
  skip: () => { label: string; answers: SlotAnswer[] };
  /**
   * A load's one-tap chip. On a card of one load it IS the answer, returned to send; on a card of
   * several it fills that load's pills and the button sends them all.
   */
  tapQuick: (group: ChatPanelGroup, chip: ChatChip) => { label: string; answers: SlotAnswer[] } | null;
  /** Loads answered "No weight", by slot. */
  unloaded: ReadonlySet<string>;
  /** Some load started on last time's numbers — the card says so ("Last time · prefilled"). */
  startedOnLast: boolean;
  /**
   * "No weight" on a load. On a card of one load it IS the answer, returned to send; on a card of
   * several it marks that load (or unmarks it) and the button sends them all.
   */
  tapNoLoad: (group: ChatPanelGroup) => { label: string; answers: SlotAnswer[] } | null;
}

/** "72,5" and "72.5" are the same number; anything that isn't a positive number is empty. */
function readNumber(text: string | undefined): number | undefined {
  const value = Number((text ?? '').trim().replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * What's entered on a chat card until it's sent. It starts on each load's starting numbers (last
 * time's load) or empty. On an empty card, setting the start suggests the peak until the peak is
 * touched — the standard screen's rule (utils/peakSuggestion). A card that started on last time
 * keeps last time's peak: it's a real number they lifted, not one to recompute.
 */
export function usePanelDraft(panel: ChatPanel): PanelDraft {
  const [loads, setLoads] = useState<Record<string, number | undefined>>(() => Object.assign({}, ...panel.groups.map((g) => g.start)));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [peakTouched, setPeakTouched] = useState<boolean>(() => panel.groups.some((g) => Object.keys(g.start).length > 0));
  // Last time had no load: the card starts on "No weight", and the button says so.
  const [unloaded, setUnloaded] = useState<ReadonlySet<string>>(() => new Set(
    panel.groups.filter((g) => g.noLoad?.start).map((g) => g.fields[0].slotId),
  ));
  const slotOf = (group: ChatPanelGroup): string => group.fields[0].slotId;
  const withoutSlot = (slot: string): void => setUnloaded((prev) => new Set([...prev].filter((id) => id !== slot)));

  const values: Record<string, number | undefined> = {
    ...Object.fromEntries(Object.entries(drafts).map(([key, text]) => [key, readNumber(text)])),
    ...loads,
  };
  const filled = panelAnswer(panel, values, unloaded);
  const canSubmit = unloaded.size > 0 || Object.values(values).some((value) => value != null && value > 0);

  return {
    values,
    drafts,
    setField: (group, field, value) => {
      const peak = group.fields.find((f) => f.field === 'weightEnd');
      const key = panelFieldKey(group.fields.find((f) => f.field === field)!);
      if (field === 'weightEnd') setPeakTouched(true);
      // A weight given is a load after all.
      if (value != null) withoutSlot(slotOf(group));
      setLoads((prev) => ({
        ...prev,
        [key]: value,
        ...(field === 'weight' && peak && !peakTouched ? { [panelFieldKey(peak)]: suggestPeak(value) } : {}),
      }));
    },
    setDraft: (key, text) => setDrafts((prev) => ({ ...prev, [key]: text })),
    commitLabel: canSubmit ? `Log ${filled.label}` : 'Log it',
    canSubmit,
    answer: () => filled,
    skip: () => panelAnswer(panel, {}),
    tapQuick: (group, chip) => {
      if (panel.groups.length === 1) return { label: chip.label, answers: chip.answers };
      const given = chip.answers[0];
      const fill = group.fields.flatMap((f): [string, number][] => {
        const value = f.field === 'weightEnd' ? given?.weightEnd ?? given?.weight : f.field === 'weight' ? given?.weight : null;
        return value != null ? [[panelFieldKey(f), value]] : [];
      });
      setLoads((prev) => ({ ...prev, ...Object.fromEntries(fill) }));
      withoutSlot(slotOf(group));
      return null;
    },
    unloaded,
    startedOnLast: panel.groups.some((g) => Object.keys(g.start).length > 0 || g.noLoad?.start === true),
    tapNoLoad: (group) => {
      const slot = slotOf(group);
      if (panel.groups.length === 1) return panelAnswer(panel, {}, new Set([slot]));
      if (unloaded.has(slot)) {
        withoutSlot(slot);
        return null;
      }
      setUnloaded((prev) => new Set([...prev, slot]));
      // Its pills empty: "no weight" and a number can't both be the answer.
      setLoads((prev) => ({ ...prev, ...Object.fromEntries(group.fields.map((f) => [panelFieldKey(f), undefined])) }));
      return null;
    },
  };
}
