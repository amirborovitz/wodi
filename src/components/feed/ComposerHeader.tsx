/**
 * The bar across the top of both composer steps.
 *
 * One component because the two steps differ only in which way the left button
 * goes and what the right one commits to — and a heading that jumped a pixel or
 * changed weight between "pick" and "details" would make Next feel like it had
 * left the screen rather than moved within it.
 */

import styles from './ComposerHeader.module.css';

interface ComposerHeaderProps {
  /** Closes the composer on the first step, returns to it on the second. */
  onLead: () => void;
  leadLabel: string;
  lead: React.ReactNode;
  action: string;
  actionEnabled: boolean;
  onAction: () => void;
}

export function ComposerHeader({
  onLead, leadLabel, lead, action, actionEnabled, onAction,
}: ComposerHeaderProps): React.ReactElement {
  return (
    <header className={styles.header}>
      <button type="button" className={styles.lead} onClick={onLead} aria-label={leadLabel}>
        {lead}
      </button>
      <h1 className={styles.title}>New post</h1>
      <button type="button" className={styles.action} disabled={!actionEnabled} onClick={onAction}>
        {action}
      </button>
    </header>
  );
}

export function CloseIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

export function BackIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function CameraIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5A2 2 0 0 1 5 6.5h2l1.2-2h7.6L17 6.5h2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="12.5" r="3.4" />
    </svg>
  );
}

export function LibraryIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16l-5-4-9 8" />
    </svg>
  );
}

export function BarbellIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="6" y1="12" x2="18" y2="12" />
      <line x1="4" y1="8" x2="4" y2="16" />
      <line x1="7" y1="7" x2="7" y2="17" />
      <line x1="17" y1="7" x2="17" y2="17" />
      <line x1="20" y1="8" x2="20" y2="16" />
    </svg>
  );
}
