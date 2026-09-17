import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useWorkouts } from '../hooks/useWorkouts';
import { useChase } from '../hooks/useChase';
import { Toast, useToast } from '../components/ui/Toast';
import type { ChaseFact } from '../services/chase/chaseFacts';
import styles from './ChaseScreen.module.css';

interface ChaseScreenProps {
  onBack: () => void;
}

/**
 * CHASE — the threads the app pulled out of the athlete's own log.
 *
 * Poster-adjacent but deliberately not a poster: square corners, ruled hairlines, no vibe
 * stamp. A poster is earned; a chase is owed. Every line on this screen is computed — see
 * `chaseFacts.ts` — which is what the footer promises and what the evidence lines prove.
 */
export function ChaseScreen({ onBack }: ChaseScreenProps): React.ReactElement {
  const { user } = useAuth();
  const { workouts } = useWorkouts(Number.MAX_SAFE_INTEGER);
  const chase = useChase(workouts);
  const toast = useToast();

  const handleSave = (fact: ChaseFact) => {
    chase.save(fact);
    toast.say(`Saved for later · ${fact.subject}`);
  };

  const handleDismiss = (fact: ChaseFact) => {
    chase.dismiss(fact);
    toast.say('Not now — off your list');
  };

  return (
    <div className={styles.screen}>
      <div className={styles.layout}>
        <header className={styles.header}>
          <button type="button" className={styles.back} onClick={onBack}>← TODAY</button>
          <h1 className={styles.title}>Chase<span className={styles.dot}>.</span></h1>
          <p className={styles.subtitle}>
            {user?.displayName?.split(' ')[0]
              ? `Pulled from your log as you train, ${user.displayName.split(' ')[0]}.`
              : 'Pulled from your log as you train.'}
          </p>
        </header>

        <div className={styles.rule}>
          <span>FROM YOUR LOG</span>
          <span className={styles.ruleLine} aria-hidden="true" />
          <span>{chase.facts.length} OPEN</span>
        </div>

        <div className={styles.list}>
          <AnimatePresence initial={false}>
            {chase.facts.map((fact) => (
              <motion.article
                key={fact.id}
                className={styles.card}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.22 }}
              >
                <div className={styles.cardHead}>
                  <span className={styles.tag}>{fact.kind}</span>
                  <span className={styles.subject}>{fact.subject.toUpperCase()}</span>
                </div>

                <p className={styles.claim}>{fact.raw}</p>

                <ul className={styles.facts}>
                  {fact.facts.map((line) => (
                    <li key={line} className={styles.fact}>
                      <span className={styles.bullet} aria-hidden="true" />
                      {line}
                    </li>
                  ))}
                </ul>

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={chase.isSaved(fact.id) ? styles.saved : styles.put}
                    disabled={chase.isSaved(fact.id)}
                    onClick={() => handleSave(fact)}
                  >
                    {chase.isSaved(fact.id) ? '✓ SAVED FOR LATER' : 'PUT IT ON THE BOARD'}
                  </button>
                  <button
                    type="button"
                    className={styles.notNow}
                    aria-label="Not now"
                    onClick={() => handleDismiss(fact)}
                  >
                    ✕
                  </button>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>

          {chase.facts.length === 0 && (
            <div className={styles.empty}>
              <span className={styles.emptyTitle}>Board&rsquo;s clear.</span>
              <span className={styles.emptyNote}>New threads appear as you log.</span>
            </div>
          )}

          <p className={styles.footnote}>Every line above is computed from workouts you logged.</p>
        </div>
      </div>

      <Toast message={toast.message} />
    </div>
  );
}
