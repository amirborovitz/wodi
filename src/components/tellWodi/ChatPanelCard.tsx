import { useState } from 'react';
import { motion } from 'framer-motion';
import { panelAnswer, panelFieldKey, type ChatPanel, type SlotAnswer } from './chatQuestions';
import styles from './ChatPanelCard.module.css';

interface ChatPanelCardProps {
  panel: ChatPanel;
  disabled: boolean;
  /** The boxes as an answer: the words of the athlete's reply, and what it fills in. */
  onSubmit: (label: string, answers: SlotAnswer[]) => void;
}

interface PanelDraft {
  drafts: Readonly<Record<string, string>>;
  setDraft: (key: string, text: string) => void;
  canSubmit: boolean;
  submit: () => void;
}

/** "72,5" and "72.5" are the same weight; anything that isn't a positive number is empty. */
function readNumber(text: string | undefined): number | undefined {
  const value = Number((text ?? '').trim().replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** What's typed in each box, until Done turns it into the answer (panelAnswer). */
function usePanelDraft(panel: ChatPanel, onSubmit: ChatPanelCardProps['onSubmit']): PanelDraft {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const values = Object.fromEntries(Object.entries(drafts).map(([key, text]) => [key, readNumber(text)]));
  return {
    drafts,
    setDraft: (key, text) => setDrafts((prev) => ({ ...prev, [key]: text })),
    canSubmit: Object.values(values).some((value) => value != null),
    submit: () => {
      const { label, answers } = panelAnswer(panel, values);
      onSubmit(label, answers);
    },
  };
}

/**
 * A question whose answer is several numbers, answered in boxes inside the chat — the start and
 * peak of a lift, a max set's reps and bar. The likely answer is one tap ("Last time · 60 → 65
 * kg"); the boxes are the fallback. Typed, never stepped: +/− steppers fire when the thread is
 * scrolled (see the stepper scroll bug). Empty until the athlete types — a prefilled box confirmed
 * with one tap would save a number nobody lifted today. A box whose emptiness has a meaning (the
 * peak: same as the start) shows that number in grey instead.
 */
export function ChatPanelCard({ panel, disabled, onSubmit }: ChatPanelCardProps) {
  const { drafts, setDraft, canSubmit, submit } = usePanelDraft(panel, onSubmit);
  return (
    <form
      className={styles.card}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit && !disabled) submit();
      }}
    >
      <p className={styles.heading}>{panel.title}</p>
      {panel.quick.length > 0 && (
        <div className={styles.quick}>
          {panel.quick.map((chip) => (
            <motion.button
              key={chip.label}
              type="button"
              className={styles.quickChip}
              disabled={disabled}
              whileTap={{ scale: 0.97 }}
              onClick={() => onSubmit(chip.label, chip.answers ?? [])}
            >
              {chip.label}
            </motion.button>
          ))}
        </div>
      )}
      {panel.groups.map((group) => (
        <fieldset key={group.title} className={styles.group}>
          <legend className={styles.title}>{group.title}</legend>
          <div className={styles.row}>
            {group.fields.map((field, index) => {
              const key = panelFieldKey(field);
              const echoed = field.emptyMeans
                ? drafts[panelFieldKey({ ...field, field: field.emptyMeans })]
                : undefined;
              return (
                <div key={key} className={styles.cell}>
                  {index > 0 && <span className={styles.joiner} aria-hidden="true">{group.joiner}</span>}
                  <label className={styles.field}>
                    <span className={styles.box}>
                      <input
                        className={styles.input}
                        type="text"
                        inputMode={field.field === 'count' ? 'numeric' : 'decimal'}
                        enterKeyHint="done"
                        autoComplete="off"
                        value={drafts[key] ?? ''}
                        placeholder={echoed ?? ''}
                        onChange={(e) => setDraft(key, e.target.value)}
                        aria-label={`${group.title} ${field.label} in ${field.unit}`}
                      />
                      <span className={styles.unit}>{field.unit}</span>
                    </span>
                    <span className={styles.label}>{field.label}</span>
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
      <motion.button
        type="submit"
        className={styles.done}
        disabled={!canSubmit || disabled}
        whileTap={{ scale: 0.97 }}
      >
        Done
      </motion.button>
    </form>
  );
}
