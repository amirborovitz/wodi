import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import styles from './SettingsList.module.css';

export interface SettingsItem {
  id: string;
  label: string;
  icon?: ReactNode;
  value?: string;
  type: 'navigation' | 'toggle' | 'action' | 'destructive';
  onPress: () => void;
}

export interface SettingsSection {
  title?: string;
  items: SettingsItem[];
}

interface SettingsListProps {
  sections: SettingsSection[];
}

export function SettingsList({ sections }: SettingsListProps) {
  return (
    <div className={styles.container}>
      {sections.map((section, sectionIndex) => (
        <motion.div
          key={section.title || sectionIndex}
          className={styles.section}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: sectionIndex * 0.05, duration: 0.3 }}
        >
          {section.title && (
            <h2 className={styles.sectionHeader}>{section.title}</h2>
          )}
          <div className={styles.list}>
            {section.items.map((item) => (
              <button
                key={item.id}
                className={`${styles.listItem} ${item.type === 'destructive' ? styles.listItemDestructive : ''}`}
                onClick={item.onPress}
              >
                {item.icon && (
                  <span className={`${styles.icon} ${item.type === 'destructive' ? styles.iconDestructive : ''}`}>
                    {item.icon}
                  </span>
                )}
                <span className={styles.label}>{item.label}</span>
                {item.value && (
                  <span className={styles.value}>{item.value}</span>
                )}
                {item.type === 'navigation' && (
                  <ChevronIcon />
                )}
              </button>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg
      className={styles.chevron}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
