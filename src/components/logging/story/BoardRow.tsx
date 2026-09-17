import { useState, type ReactNode } from 'react';
import styles from './BoardRow.module.css';

interface BoardRowProps {
  /** The board's own line for this movement ("21 Thruster", "1 · Single Leg Hip Thrust"). */
  name: string;
  /** The board's quantity or load beside the name ("@ 42.5kg", "30 reps"). */
  load?: string;
  /** A small pill after the name — which occurrence of a repeated movement this is. */
  tag?: string;
  /** What the athlete entered, on its own line ("You: 30 → 35 kg"). Empty until they do. */
  personal?: string;
  /** Rows sharing a group open one at a time. */
  group: string;
  /** What the editor edits ("Weight"). A row without an editor renders read-only. */
  action?: string;
  /** Mount open. Read once: after that the athlete owns the row. */
  defaultOpen?: boolean;
  /** The editor, shown when the row is opened. */
  children?: ReactNode;
}

/**
 * One movement of a board, read back as one line — the editor stays closed until the athlete
 * taps the row. THE compact row: the ordered for-time board and the strength circuit both draw
 * their movements with it, so a long board reads as a list the athlete can take in at a glance
 * instead of a screen of full-height editors to scroll past.
 */
export function BoardRow({
  name, load, tag, personal, group, action, defaultOpen = false, children,
}: BoardRowProps) {
  const [mountOpen] = useState(defaultOpen);
  const summary = (
    <span className={styles.text}>
      <span className={styles.name}>{name}</span>
      {load && <span className={styles.load}>{load}</span>}
      {tag && <span className={styles.tag}>{tag}</span>}
      {personal && <span className={styles.personal}>{personal}</span>}
    </span>
  );

  if (children == null) {
    return (
      <div className={styles.row}>
        <div className={styles.readOnly}>{summary}</div>
      </div>
    );
  }

  return (
    // `open` never changes after mount, so React never writes it again — the native toggle, and
    // the one-open-at-a-time `name` group, stay the browser's.
    <details className={styles.row} name={group} open={mountOpen || undefined}>
      <summary className={styles.summary}>
        {summary}
        <span className={styles.action}>
          {action && <span className={styles.actionLabel}>{action}</span>}
          <ChevronIcon />
        </span>
      </summary>
      <div className={styles.editor}>{children}</div>
    </details>
  );
}

/**
 * What a closed row opens, said on the row itself.
 *
 * A bare "+" claims the row ADDS something. It doesn't — it opens the one thing this movement
 * lets you change, and that thing is different on every row: a weight on the thruster, a
 * distance on the run, a swap on the pull-up. The row says which before you tap it.
 */
export function boardRowAction(quantity: string | undefined, hasAlternates: boolean): string {
  // A run takes a distance AND swaps for a bike. Naming only the first hides the second behind
  // a row that claims to be about metres — which is how a swap you can do reads as one you can't.
  if (quantity && hasAlternates) return `${quantity} · swap`;
  if (quantity) return quantity;
  return hasAlternates ? 'Swap' : 'Edit';
}

// Chevron — the row opens, it does not add.
function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M3 4.5 6 7.5 9 4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
