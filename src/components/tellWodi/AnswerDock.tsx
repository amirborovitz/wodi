import { Fragment } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { DockWeight, PanelDock } from './usePanelDock';
import { useHoldStep } from './useHoldStep';
import styles from './AnswerDock.module.css';

interface AnswerDockProps {
  dock: PanelDock;
  disabled: boolean;
  secondary?: { label: string; onClick: () => void };
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/** −/+ : a tap is one step, a hold is two (useHoldStep — scroll-safe). */
function StepButton({ weight, direction, disabled, className }: { weight: DockWeight; direction: 1 | -1; disabled: boolean; className: string }) {
  const handlers = useHoldStep(direction > 0 ? weight.plus : weight.minus, () => weight.jump(direction));
  return (
    <motion.button
      type="button"
      className={className}
      whileTap={{ scale: 0.9 }}
      disabled={disabled}
      aria-label={`${direction > 0 ? 'More' : 'Less'} ${weight.label}`}
      {...handlers}
    >
      {direction > 0 ? '+' : '−'}
    </motion.button>
  );
}

/** kg | lb beside the weight: the unit they lifted in. */
function UnitSwitch({ dock, disabled }: { dock: PanelDock; disabled: boolean }) {
  const units = dock.unitSwitch;
  if (!units) return null;
  return (
    <div className={styles.units} role="group" aria-label="Unit">
      {units.options.map((unit) => (
        <button
          key={unit}
          type="button"
          className={`${styles.unitOption} ${unit === units.on ? styles.unitOn : ''}`}
          aria-pressed={unit === units.on}
          disabled={disabled}
          onClick={() => units.pick(unit)}
        >
          {unit}
        </button>
      ))}
    </div>
  );
}

/**
 * The bottom of the chat while a card is open, in the keyboard's place, under the message box
 * ("lunges instead of step-ups" is said there, not keyed): progress ticks, the
 * answer being asked (its either/or beside it), a big number, its likely answers one tap each,
 * and a pad with Next where the thumb already is. Renders usePanelDock; decides nothing.
 */
export function AnswerDock({ dock, disabled, secondary }: AnswerDockProps) {
  const empty = dock.display === '';
  return (
    <motion.section
      className={styles.dock}
      aria-label="Answer"
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
    >
      {dock.ticks.length > 0 && <div className={styles.ticks}>
        {dock.ticks.map((tick, index) => (
          <button
            key={index}
            type="button"
            className={styles.tickHit}
            onClick={tick.open}
            disabled={disabled}
            aria-label={`Answer ${index + 1}`}
            aria-current={tick.active || undefined}
          >
            <span className={`${styles.tick} ${tick.filled || tick.active ? styles.tickOn : ''} ${tick.active ? styles.tickActive : ''}`} />
          </button>
        ))}
      </div>}

      <div className={styles.head}>
        {dock.canGoBack && <button type="button" className={styles.back} onClick={dock.goBack} disabled={disabled} aria-label="Previous answer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>}
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p
            key={dock.stepName}
            className={styles.name}
            initial={{ x: 16, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -16, opacity: 0 }}
            transition={{ duration: 0.16 }}
          >
            {dock.stepName}
          </motion.p>
        </AnimatePresence>
        {dock.choice ? (
          <div className={styles.choice} role="group" aria-label="Which one">
            {dock.choice.labels.map((label, index) => (
              <button
                key={label}
                type="button"
                className={`${styles.choiceOption} ${index === dock.choice!.on ? styles.choiceOn : ''}`}
                aria-pressed={index === dock.choice!.on}
                disabled={disabled}
                onClick={() => dock.choice!.pick(index)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : dock.pair && dock.pair.length > 1 && dock.unitSwitch ? (
          <UnitSwitch dock={dock} disabled={disabled} />
        ) : (
          <span className={styles.position}>{dock.position}</span>
        )}
      </div>

      {dock.pair?.length === 1 ? (
        // One weight ("wodi weights", design C): −/+ beside the number, kg | lb beside it.
        <div className={styles.single} aria-live="polite">
          <StepButton weight={dock.pair[0]} direction={-1} disabled={disabled} className={styles.stepRound} />
          <div className={styles.singleValue}>
            <span className={dock.pair[0].display ? styles.singleNumber : styles.singleEmpty}>{dock.pair[0].display || dock.placeholder}</span>
            <span className={styles.caret} aria-hidden="true" />
            {dock.unitSwitch ? <UnitSwitch dock={dock} disabled={disabled} /> : <span className={styles.unit}>{dock.pair[0].unit}</span>}
          </div>
          <StepButton weight={dock.pair[0]} direction={1} disabled={disabled} className={styles.stepRound} />
        </div>
      ) : dock.pair ? (
        // One answer, its boxes side by side (start → peak, reps @ weight), the pad typing into the one tapped.
        <div className={styles.pair} aria-live="polite">
          {dock.pair.map((weight, index) => (
            <Fragment key={weight.label}>
              {index > 0 && <span className={styles.pairArrow} aria-hidden="true">{dock.pairJoiner}</span>}
              <div className={`${styles.weight} ${weight.active ? styles.weightOn : ''}`}>
                <button type="button" className={styles.weightPick} onClick={weight.select} disabled={disabled} aria-pressed={weight.active}>
                  <span className={styles.weightLabel}>{weight.label}</span>
                  <span className={weight.display ? styles.weightNumber : styles.weightEmpty}>
                    {weight.display || dock.placeholder}
                    {weight.unit && <span className={styles.weightUnit}>{weight.unit}</span>}
                  </span>
                </button>
                <div className={styles.weightSteps}>
                  <StepButton weight={weight} direction={-1} disabled={disabled} className={styles.step} />
                  <StepButton weight={weight} direction={1} disabled={disabled} className={styles.step} />
                </div>
              </div>
            </Fragment>
          ))}
        </div>
      ) : (
        <div className={styles.readout} aria-live="polite">
          <motion.span
            key={dock.display}
            className={empty ? styles.numberEmpty : styles.number}
            initial={empty ? false : { scale: 1.08 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 700, damping: 22 }}
          >
            {empty ? dock.placeholder : dock.display}
          </motion.span>
          {dock.unit && <span className={styles.unit}>{dock.unit}</span>}
        </div>
      )}

      <div className={styles.chips}>
        {dock.ladder.map((rung) => (
          <motion.button
            key={`ladder-${rung.label}`}
            type="button"
            className={`${styles.chip} ${styles.rung} ${rung.on ? styles.chipOn : ''}`}
            aria-pressed={rung.on}
            disabled={disabled}
            whileTap={{ scale: 0.94 }}
            onClick={rung.tap}
          >
            {rung.label}
            {rung.last && <span className={styles.rungLast}>last</span>}
          </motion.button>
        ))}
        {dock.chips.map((chip) => (
          <motion.button
            key={chip.label}
            type="button"
            className={`${styles.chip} ${chip.on ? styles.chipOn : ''}`}
            aria-pressed={chip.on}
            disabled={disabled}
            whileTap={{ scale: 0.94 }}
            onClick={chip.tap}
          >
            {chip.label}
          </motion.button>
        ))}
        {secondary && (
          <button type="button" className={styles.secondary} disabled={disabled} onClick={secondary.onClick}>{secondary.label}</button>
        )}
      </div>

      <div className={styles.pad}>
        {KEYS.map((key) => (
          <motion.button key={key} type="button" className={styles.key} whileTap={{ scale: 0.92 }} disabled={disabled} onClick={() => dock.press(key)}>
            {key}
          </motion.button>
        ))}
        <motion.button
          type="button"
          className={`${styles.key} ${styles.keyDot}`}
          whileTap={{ scale: 0.92 }}
          disabled={disabled || !dock.decimal}
          onClick={() => dock.press('.')}
          aria-label="Decimal point"
        >
          {dock.decimal ? '.' : ''}
        </motion.button>
        <motion.button type="button" className={`${styles.key} ${styles.keyZero}`} whileTap={{ scale: 0.92 }} disabled={disabled} onClick={() => dock.press('0')}>
          0
        </motion.button>
        <motion.button type="button" className={`${styles.key} ${styles.keyQuiet} ${styles.keyDel}`} whileTap={{ scale: 0.92 }} disabled={disabled} onClick={dock.backspace} aria-label="Delete">
          <svg width="24" height="18" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
            <path d="M8 1h13a2 2 0 012 2v12a2 2 0 01-2 2H8l-7-8z" />
            <path d="M11 5.5l7 7M18 5.5l-7 7" />
          </svg>
        </motion.button>
        <motion.button type="button" className={styles.next} whileTap={{ scale: 0.95 }} disabled={disabled} onClick={dock.next}>
          {dock.nextLabel}
        </motion.button>
        <motion.button type="button" className={`${styles.key} ${styles.keyQuiet} ${styles.keySkip}`} whileTap={{ scale: 0.92 }} disabled={disabled} onClick={dock.skip}>
          Skip
        </motion.button>
      </div>
    </motion.section>
  );
}
