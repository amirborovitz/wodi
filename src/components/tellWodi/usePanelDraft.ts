import { useState } from 'react';
import { suggestPeak } from '../../utils/peakSuggestion';
import { panelAnswer, panelFieldKey, type ChatPanel, type ChatPanelGroup, type SlotAnswer } from './chatQuestions';

export interface PanelDraft {
  /** Every field's number — set on a weight pill or typed into a box. */
  values: Readonly<Record<string, number | undefined>>;
  /** What's typed in each plain box, as typed. */
  drafts: Readonly<Record<string, string>>;
  setWeight: (group: ChatPanelGroup, field: 'weight' | 'weightEnd', value: number | undefined) => void;
  setDraft: (key: string, text: string) => void;
  /** "Log 60 → 65 kg" — the button names exactly what it saves. */
  commitLabel: string;
  canSubmit: boolean;
  /** The card as an answer: the words of the athlete's reply, and what it fills in. */
  answer: () => { label: string; answers: SlotAnswer[] };
  /** Every group skipped. */
  skip: () => { label: string; answers: SlotAnswer[] };
}

/** "72,5" and "72.5" are the same number; anything that isn't a positive number is empty. */
function readNumber(text: string | undefined): number | undefined {
  const value = Number((text ?? '').trim().replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * What's entered on a chat card until it's sent. It starts on the panel's starting numbers (last
 * time's load) or empty. On an empty card, setting the start suggests the peak until the peak is
 * touched — the standard screen's rule (utils/peakSuggestion). A card that started on last time
 * keeps last time's peak: it's a real number they lifted, not one to recompute.
 */
export function usePanelDraft(panel: ChatPanel): PanelDraft {
  const [loads, setLoads] = useState<Record<string, number | undefined>>(() => ({ ...panel.start }));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [peakTouched, setPeakTouched] = useState<boolean>(() => Object.keys(panel.start).length > 0);

  const values: Record<string, number | undefined> = {
    ...Object.fromEntries(Object.entries(drafts).map(([key, text]) => [key, readNumber(text)])),
    ...loads,
  };
  const filled = panelAnswer(panel, values);
  const canSubmit = Object.values(values).some((value) => value != null && value > 0);

  return {
    values,
    drafts,
    setWeight: (group, field, value) => {
      const peak = group.fields.find((f) => f.field === 'weightEnd');
      const key = panelFieldKey(group.fields.find((f) => f.field === field)!);
      if (field === 'weightEnd') setPeakTouched(true);
      setLoads((prev) => ({
        ...prev,
        [key]: value,
        ...(field === 'weight' && peak && !peakTouched ? { [panelFieldKey(peak)]: suggestPeak(value) } : {}),
      }));
    },
    setDraft: (key, text) => setDrafts((prev) => ({ ...prev, [key]: text })),
    commitLabel: canSubmit && panel.groups.length === 1 ? `Log ${filled.label}` : 'Log it',
    canSubmit,
    answer: () => filled,
    skip: () => panelAnswer(panel, {}),
  };
}
