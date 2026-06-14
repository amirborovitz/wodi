import type { HighlightStampData } from './types';

type ClassMap = Record<string, string>;

interface HighlightStampViewProps {
  stamp: HighlightStampData;
  styles: ClassMap;
}

export function HighlightStampView({ stamp, styles }: HighlightStampViewProps) {
  return (
    <div
      className={`${styles.highlightStamp} ${styles.highlightStampHero} ${stamp.color === 'yellow' ? styles.highlightStampYellow : styles.highlightStampMagenta}`}
      style={{ transform: `rotate(${stamp.rotation}deg)` }}
    >
      <span className={styles.highlightStampTitle}>{stamp.title}</span>
      <span className={styles.highlightStampValue}>{stamp.value}</span>
      <span className={styles.highlightStampNote}>{stamp.note}</span>
    </div>
  );
}

