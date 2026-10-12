import { Fragment } from 'react';
import { motion } from 'framer-motion';
import { panelFieldKey, type ChatPanel, type SlotAnswer } from './chatQuestions';
import { usePanelDraft } from './usePanelDraft';
import { WeightPill } from './WeightPill';
import styles from './ChatPanelCard.module.css';

interface ChatPanelCardProps {
  panel: ChatPanel;
  disabled: boolean;
  /** The card as an answer: the words of the athlete's reply, and what it fills in. */
  onSubmit: (label: string, answers: SlotAnswer[]) => void;
}

const PILL_LABEL: Record<string, string> = { start: 'Start weight', peak: 'Peak weight', weight: 'Weight' };

/**
 * A question whose answer is a load or a few numbers, answered on one compact card inside the
 * chat: the lift named once, last time beside it, −/+ pills (start → peak for a lift in sets),
 * and one button that names what it saves — "Log 60 → 65 kg". With history the card starts on
 * last time, so the likely answer is that one tap; without, it starts empty and the board's Rx
 * loads are one tap each. Skip lives on the card.
 */
export function ChatPanelCard({ panel, disabled, onSubmit }: ChatPanelCardProps) {
  const { values, drafts, setWeight, setDraft, commitLabel, canSubmit, answer, skip } = usePanelDraft(panel);
  const send = (filled: { label: string; answers: SlotAnswer[] }): void => onSubmit(filled.label, filled.answers);
  return (
    <form
      className={styles.card}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit && !disabled) send(answer());
      }}
    >
      <div className={styles.head}>
        <p className={styles.heading}>{panel.title}</p>
        {panel.last && <span className={styles.last}>{panel.last}</span>}
      </div>
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
          {panel.groups.length > 1 && <legend className={styles.groupTitle}>{group.title}</legend>}
          <div className={styles.row}>
            {group.fields.map((field, index) => {
              const key = panelFieldKey(field);
              return (
                <Fragment key={key}>
                  {index > 0 && <span className={styles.joiner} aria-hidden="true">{group.joiner}</span>}
                  <div className={styles.col}>
                    <span className={styles.colLabel}>{field.label}</span>
                    {group.control === 'weight' && field.field !== 'count' ? (
                      <WeightPill
                        value={values[key]}
                        onChange={(value) => setWeight(group, field.field as 'weight' | 'weightEnd', value)}
                        step={group.step ?? 2.5}
                        base={group.base}
                        unit={field.unit}
                        label={PILL_LABEL[field.label] ?? field.label}
                      />
                    ) : (
                      <span className={styles.box}>
                        <input
                          className={styles.input}
                          type="text"
                          inputMode={field.field === 'count' ? 'numeric' : 'decimal'}
                          enterKeyHint="done"
                          autoComplete="off"
                          value={drafts[key] ?? ''}
                          onChange={(e) => setDraft(key, e.target.value)}
                          aria-label={`${group.title} ${field.label} in ${field.unit}`}
                        />
                        <span className={styles.unit}>{field.unit}</span>
                      </span>
                    )}
                  </div>
                </Fragment>
              );
            })}
          </div>
        </fieldset>
      ))}
      <div className={styles.actions}>
        <motion.button
          type="submit"
          className={styles.log}
          disabled={!canSubmit || disabled}
          whileTap={{ scale: 0.97 }}
        >
          {commitLabel}
        </motion.button>
        <motion.button
          type="button"
          className={styles.skip}
          disabled={disabled}
          whileTap={{ scale: 0.97 }}
          onClick={() => send(skip())}
        >
          Skip
        </motion.button>
      </div>
    </form>
  );
}
