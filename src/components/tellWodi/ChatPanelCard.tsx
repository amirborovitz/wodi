import { Fragment } from 'react';
import { motion } from 'framer-motion';
import { panelFieldKey, type ChatPanel, type ChatPanelGroup, type SlotAnswer } from './chatQuestions';
import { usePanelDraft } from './usePanelDraft';
import { NumberPill } from './NumberPill';
import styles from './ChatPanelCard.module.css';

interface ChatPanelCardProps {
  panel: ChatPanel;
  disabled: boolean;
  /** The card as an answer: the words of the athlete's reply, and what it fills in. */
  onSubmit: (label: string, answers: SlotAnswer[]) => void;
  /** The quiet button in Skip's place — "Didn't do it" on a saved board's first question. */
  secondary?: { label: string; onClick: () => void };
}

const PILL_LABEL: Record<string, string> = { start: 'Start weight', peak: 'Peak weight', weight: 'Weight', min: 'Minutes', sec: 'Seconds' };

/**
 * A question whose answer is a load or a few numbers, answered on one compact card inside the
 * chat: each load named once, last time beside it, −/+ pills (start → peak for a lift in sets),
 * and one button that names what it saves — "Log 60 → 65 kg", "Log 40 kg · 16 kg" for a metcon's
 * loads together. With history a load starts on last time, so the likely answer is that one tap;
 * without, it starts empty and its likely loads are one tap each. Skip lives on the card.
 */
export function ChatPanelCard({ panel, disabled, onSubmit, secondary }: ChatPanelCardProps) {
  const { values, drafts, setField, setDraft, commitLabel, canSubmit, answer, skip, tapQuick, unloaded, tapNoLoad, startedOnLast } = usePanelDraft(panel);
  const send = (filled: { label: string; answers: SlotAnswer[] }): void => onSubmit(filled.label, filled.answers);
  const several = panel.groups.length > 1;
  const quick = (group: ChatPanelGroup) => (group.quick.length > 0 || group.noLoad) && (
    <div className={styles.quick}>
      {group.noLoad && (
        <motion.button
          type="button"
          className={`${styles.quickChip} ${unloaded.has(group.fields[0].slotId) ? styles.quickChipOn : ''}`}
          aria-pressed={unloaded.has(group.fields[0].slotId)}
          disabled={disabled}
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            const sent = tapNoLoad(group);
            if (sent) send(sent);
          }}
        >
          No weight
        </motion.button>
      )}
      {group.quick.map((chip) => (
        <motion.button
          key={chip.label}
          type="button"
          className={styles.quickChip}
          disabled={disabled}
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            const sent = tapQuick(group, chip);
            if (sent) send(sent);
          }}
        >
          {chip.label}
        </motion.button>
      ))}
    </div>
  );
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
        {panel.meta && <span className={styles.last}>{panel.meta}</span>}
        {!several && panel.groups[0]?.last && <span className={styles.last}>{panel.groups[0].last}</span>}
        {several && startedOnLast && <span className={styles.last}>Last time · prefilled</span>}
      </div>
      {!several && panel.groups[0] && quick(panel.groups[0])}
      {panel.groups.map((group) => (
        <fieldset key={group.title} className={styles.group}>
          {several && (
            <legend className={styles.groupTitle}>
              {group.kit ? `${group.title} · ${group.kit}` : group.title}
            </legend>
          )}
          {several && quick(group)}
          {group.control === 'bells' ? (
            <div className={styles.bells}>
              {group.pair && <em className={styles.bellsPair}>2 ×</em>}
              {(group.sizes ?? []).map((size) => {
                const key = panelFieldKey(group.fields[0]);
                const on = values[key] === size;
                return (
                  <motion.button
                    key={size}
                    type="button"
                    className={`${styles.bell} ${on ? styles.bellOn : ''}`}
                    aria-pressed={on}
                    aria-label={`${size} ${group.fields[0].unit}`}
                    disabled={disabled}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setField(group, 'weight', on ? undefined : size)}
                  >
                    {size}
                  </motion.button>
                );
              })}
              <small className={styles.bellsUnit}>{group.fields[0].unit}</small>
            </div>
          ) : (
            <div className={styles.row}>
              {group.fields.map((field, index) => {
                const key = panelFieldKey(field);
                return (
                  <Fragment key={key}>
                    {index > 0 && <span className={styles.joiner} aria-hidden="true">{group.joiner}</span>}
                    <div className={styles.col}>
                      {group.fields.length > 1 && <span className={styles.colLabel}>{field.label}</span>}
                      {group.control === 'clock' ? (
                        <NumberPill
                          value={values[key]}
                          onChange={(value) => setField(group, field.field, value)}
                          {...(field.field === 'seconds'
                            ? { step: 5, zero: true, max: 59, pad: 2, placeholder: '00' }
                            : { step: 1, base: group.base })}
                          label={PILL_LABEL[field.label] ?? field.label}
                        />
                      ) : group.control === 'weight' && field.field !== 'count' ? (
                        <NumberPill
                          value={values[key]}
                          onChange={(value) => setField(group, field.field, value)}
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
          )}
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
          onClick={() => (secondary ? secondary.onClick() : send(skip()))}
        >
          {secondary?.label ?? 'Skip'}
        </motion.button>
      </div>
    </form>
  );
}
