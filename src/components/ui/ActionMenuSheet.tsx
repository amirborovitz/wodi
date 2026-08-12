import type React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './ActionMenuSheet.module.css';

export interface ActionMenuItem {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  /** Dims the row — for an option that admits a problem rather than one the athlete came for. */
  quiet?: boolean;
}

interface ActionMenuSheetProps {
  /** Null closes the sheet. Anything else opens it and labels the header. */
  title: string | null;
  items: ActionMenuItem[];
  onClose: () => void;
}

/**
 * Bottom sheet listing choices — what a "⋯" opens.
 *
 * Deliberately not folded into `DeleteActionSheet`: that one is a destructive *confirm* and its
 * contract is built around a single irreversible action (busy while the server acks, an error
 * that keeps the sheet up). A menu picks between actions and dismisses immediately. Merging them
 * would mean one component with two mutually exclusive halves.
 *
 * Selecting an item closes the sheet first, so an item that opens a second sheet doesn't stack.
 */
export function ActionMenuSheet({ title, items, onClose }: ActionMenuSheetProps) {
  return (
    <AnimatePresence>
      {title && (
        <>
          <motion.div
            className={styles.menuBackdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className={styles.menuSheet}
            role="menu"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          >
            <div className={styles.menuTitle}>{title}</div>
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`${styles.menuItem} ${item.quiet ? styles.menuItemQuiet : ''}`}
                onClick={() => { onClose(); item.onClick(); }}
              >
                {item.icon && <span className={styles.menuItemIcon}>{item.icon}</span>}
                {item.label}
              </button>
            ))}
            <button type="button" className={styles.menuCancel} onClick={onClose}>
              Cancel
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
