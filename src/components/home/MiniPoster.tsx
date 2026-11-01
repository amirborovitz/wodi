import type React from 'react';
import type { MiniPosterData } from '../../hooks/useMiniPoster';
import styles from './MiniPoster.module.css';

/** A poster at thumbnail size: skin colours, title, result, the wordmark strip. Render-only. */
export function MiniPoster({ data }: { data: MiniPosterData | null }): React.ReactElement {
  if (!data) return <span className={`${styles.tile} ${styles.pending}`} aria-hidden="true" />;
  return (
    <span className={styles.tile} style={{ background: data.bg, color: data.ink }} aria-hidden="true">
      <span className={styles.title}>{data.title}</span>
      {data.result && <span className={`${styles.result} ${styles[data.resultSize]}`}>{data.result}</span>}
      <span className={styles.strip} style={{ background: data.accent }} />
    </span>
  );
}
