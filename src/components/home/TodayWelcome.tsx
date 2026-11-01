import type React from 'react';
import { usePhotoPicker } from '../../hooks/usePhotoPicker';
import { resultSizeFor, type MiniPosterData } from '../../hooks/useMiniPoster';
import { getSkin } from '../celebration/faces/HandwrittenFace/skinRegistry';
import { MiniPoster } from './MiniPoster';
import { CameraIcon } from './CameraIcon';
import styles from './TodayWelcome.module.css';

/** What the athlete is about to make — named benchmarks, in three skins. Shown as examples, never as theirs. */
const SAMPLES: readonly MiniPosterData[] = ([
  ['press', 'GRACE', '3:10'],
  ['slab', 'FRAN', '4:58'],
  ['blueprint', 'MURPH', '52:14'],
] as const).map(([skin, title, result]) => {
  const { ticket } = getSkin(skin);
  return { bg: ticket.bg, ink: ticket.ink, accent: ticket.dot, title, result, resultSize: resultSizeFor(result) };
});

interface TodayWelcomeProps {
  firstName: string;
  onPhoto: (file: File) => void;
  onTellWodi: () => void;
}

/** No workout and no board yet: warm, personal, one action. Nothing to show is nothing shown. */
export function TodayWelcome({ firstName, onPhoto, onTellWodi }: TodayWelcomeProps): React.ReactElement {
  const picker = usePhotoPicker(onPhoto);
  return (
    <div className={styles.welcome}>
      <div className={styles.copy}>
        <span className={styles.hello}>Hey {firstName}.</span>
        <span className={styles.text}>Every workout you do becomes a poster.<br />Start your collection after class.</span>
      </div>
      <div className={styles.samples} aria-hidden="true">
        {SAMPLES.map((sample, i) => (
          <span key={sample.title} className={styles.sample} style={{ '--i': i - 1 } as React.CSSProperties}>
            <MiniPoster data={sample} />
          </span>
        ))}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.snap} onClick={picker.open}>
          <CameraIcon size={22} />
          Snap today's board
        </button>
        <input ref={picker.inputRef} type="file" accept="image/*" className={styles.hiddenInput} onChange={picker.onChange} />
        <button type="button" className={styles.alt} onClick={onTellWodi}>No board? <u>Type it in</u></button>
      </div>
    </div>
  );
}
