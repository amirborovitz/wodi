import type { WodiMemoryData } from '../../hooks/useWodiMemory';
import styles from './WodiMemoryCard.module.css';

/**
 * "What Wodi knows" on Me — the notes the athlete confirmed (each one forgettable) and the habits
 * read off their log. Nothing Wodi uses about them is hidden from them.
 */
export function WodiMemoryCard({ data }: { data: WodiMemoryData }) {
  const empty = data.notes.length === 0 && data.habits.length === 0;

  return (
    <section className={styles.card} aria-label="What Wodi knows">
      <h2 className={styles.eyebrow}>What Wodi knows</h2>

      {empty && (
        <p className={styles.empty}>
          Tell Wodi about an injury, a goal or the kit you have at home, and it'll offer to remember it.
        </p>
      )}

      {data.notes.length > 0 && (
        <ul className={styles.list}>
          {data.notes.map((note) => (
            <li key={note.id} className={styles.row}>
              <div className={styles.rowText}>
                <span className={styles.rowLabel}>{note.text}</span>
                <span className={styles.rowSub}>You told me {note.since}</span>
              </div>
              <button type="button" className={styles.forget} onClick={() => data.forget(note.id)}>
                Forget
              </button>
            </li>
          ))}
        </ul>
      )}

      {data.habits.length > 0 && (
        <>
          <h3 className={styles.subEyebrow}>From your log</h3>
          <ul className={styles.list}>
            {data.habits.map((habit) => (
              <li key={habit.id} className={styles.row}>
                <div className={styles.rowText}>
                  <span className={styles.rowLabel}>{habit.label}</span>
                  <span className={styles.rowSub}>{habit.detail}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className={styles.footnote}>Wodi asks before using these. Change what you do and they update themselves.</p>
        </>
      )}
    </section>
  );
}
