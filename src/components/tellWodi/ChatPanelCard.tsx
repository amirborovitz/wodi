import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import type { ChatPanel, SlotAnswer } from './chatQuestions';
import { usePanelDock } from './usePanelDock';
import { AnswerDock } from './AnswerDock';
import styles from './ChatPanelCard.module.css';

interface ChatPanelCardProps {
  panel: ChatPanel;
  disabled: boolean;
  /** The card as an answer: the words of the athlete's reply, and what it fills in. */
  onSubmit: (label: string, answers: SlotAnswer[]) => void;
  /** A quiet answer beside the chips — "Didn't do it" on a saved board's first question. */
  secondary?: { label: string; onClick: () => void };
  /**
   * Answered: the card stays where it was, exactly as it was sent — every number, the side picked
   * on an either/or — dimmed and out of reach. Nothing the athlete was shown disappears.
   */
  locked?: boolean;
  /** Where the dock goes — the bottom of the chat screen, under the message box. */
  dockHost: HTMLElement | null;
  /** The athlete is typing in the message box: the keyboard is up, the dock steps aside. */
  dockHidden: boolean;
}

/**
 * A question whose answer is a few numbers — a station board's counts, a lift's start → peak, a
 * finish time. In the thread: one compact card, a line per movement, filling in live, the one
 * being answered marked. At the bottom: the dock, asking one answer at a time on its own number
 * pad. Every state lives in usePanelDock; this renders it.
 */
export function ChatPanelCard({ panel, disabled, onSubmit, secondary, locked = false, dockHost, dockHidden }: ChatPanelCardProps) {
  const dock = usePanelDock(panel, (reply) => onSubmit(reply.label, reply.answers));
  const open = !locked;
  // The row being answered stays on screen as the dock moves down the card — scrolled only as far
  // as it takes, so the question above stays put while it fits.
  const activeRef = useRef<HTMLButtonElement>(null);
  const activeIndex = dock.rows.findIndex((row) => row.active);
  useEffect(() => {
    if (open) activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex, open]);
  return (
    <>
      <div className={`${styles.card} ${locked ? styles.cardLocked : ''}`} inert={locked}>
        <div className={styles.head}>
          <p className={styles.heading}>{panel.title}</p>
          {panel.meta && <span className={styles.meta}>{panel.meta}</span>}
        </div>
        <ul className={styles.rows}>
          {dock.rows.map((row) => (
            <li key={row.key}>
              <button
                ref={row.active ? activeRef : undefined}
                type="button"
                className={`${styles.row} ${open && row.active ? styles.rowActive : ''}`}
                disabled={!open || disabled}
                onClick={row.open}
              >
                {open && row.active && <motion.span layoutId={`dock-bar-${panel.title}`} className={styles.bar} transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                <span className={styles.rowTitle}>{row.title}</span>
                <motion.span
                  key={row.value ?? ''}
                  className={row.value ? styles.rowValue : styles.rowEmpty}
                  initial={row.value ? { scale: 1.25, opacity: 0.4 } : false}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 600, damping: 26 }}
                >
                  {row.value ?? '—'}
                </motion.span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {open && !dockHidden && dockHost && createPortal(
        <AnswerDock dock={dock} disabled={disabled} secondary={secondary} />,
        dockHost,
      )}
    </>
  );
}
