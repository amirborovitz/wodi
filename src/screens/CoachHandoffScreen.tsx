import { useState } from 'react';
import { motion } from 'framer-motion';
import { useWorkouts } from '../hooks/useWorkouts';
import { useCoachHandoff } from '../hooks/useCoachHandoff';
import styles from './CoachHandoffScreen.module.css';

interface CoachHandoffScreenProps {
  onBack: () => void;
}

/** The apps most people paste into. Links only — wodi sends nothing anywhere. */
const DESTINATIONS = [
  { name: 'ChatGPT', href: 'https://chat.openai.com/', color: '#10a37f' },
  { name: 'Claude', href: 'https://claude.ai/new', color: '#d97757' },
  { name: 'Gemini', href: 'https://gemini.google.com/app', color: '#4285f4' },
] as const;

/**
 * COACH HANDOFF — one question, one scope, one paste.
 *
 * Not an export screen. You hand a coach your notebook and ask them something; the question is
 * the feature, and the chip writes the system prompt so the athlete doesn't have to. The preview
 * is the trust moment: the text is shown before it leaves, and the line under the button says
 * where it goes, which is nowhere.
 *
 * Every number and every string here comes from useCoachHandoff — this file only lays them out.
 */
export function CoachHandoffScreen({ onBack }: CoachHandoffScreenProps): React.ReactElement {
  const { workouts } = useWorkouts(Number.MAX_SAFE_INTEGER);
  const handoff = useCoachHandoff(workouts);
  const [expanded, setExpanded] = useState(false);

  const copied = handoff.copyState === 'copied';

  return (
    <div className={styles.screen}>
      <div className={styles.layout}>
        <div className={styles.nav}>
          <button type="button" className={styles.back} onClick={onBack} aria-label="Back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <polyline points="15 6 9 12 15 18" />
            </svg>
          </button>
          <div className={styles.navTitle}>Coach handoff</div>
        </div>

        {copied ? (
          <>
            <motion.div
              className={styles.done}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28 }}
            >
              <div className={styles.stamp}>Copied.</div>
              <div className={styles.doneHeadline}>
                {handoff.scopedCount} workouts on<br />your clipboard
              </div>
              <div className={styles.doneMeta}>
                {handoff.words.toLocaleString()} words · {handoff.scope.phrase} · {handoff.unit}
              </div>
              <div className={styles.doneAside}>go get yourself programmed</div>

              <div className={styles.questionCard}>
                <div className={styles.eyebrow}>Your question</div>
                <div className={styles.questionEcho}>&ldquo;{handoff.question.echo}&rdquo;</div>
              </div>

              <div className={`${styles.step} ${styles.stepFirst}`}>
                <span className={styles.stepNum}>1</span>
                <span className={styles.stepText}>Start a <b>new chat</b> in any AI app</span>
              </div>
              <div className={styles.step}>
                <span className={styles.stepNum}>2</span>
                <span className={styles.stepText}>Paste, send, and answer its questions honestly.</span>
              </div>
            </motion.div>

            <div className={styles.foot}>
              <div className={`${styles.eyebrow} ${styles.destsLabel}`}>
                Jump straight there
              </div>
              <div className={styles.dests}>
                {DESTINATIONS.map((dest) => (
                  <a
                    key={dest.name}
                    className={styles.dest}
                    href={dest.href}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <span className={styles.destDot} style={{ background: dest.color }} />
                    {dest.name}
                  </a>
                ))}
              </div>
              <button type="button" className={styles.ghostBtn} onClick={handoff.reset}>
                Copy again
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.hero}>
              <div className={styles.eyebrow}>Your training log</div>
              <div className={styles.heroCount}>
                <span className={styles.heroNumber}>{handoff.totalWorkouts}</span>
                <span className={styles.heroTape}>WORKOUTS</span>
              </div>
              <div className={styles.heroMeta}>
                {[handoff.spanLabel, handoff.unit].filter(Boolean).join(' · ')}
              </div>
              <div className={styles.aside}>every rep you actually did — no vibes, no rounding</div>
            </div>

            <div className={styles.section}>
              <div className={styles.eyebrow}>So what do you want to know?</div>
              <div className={styles.chips}>
                {handoff.questions.map((question) => (
                  <button
                    key={question.id}
                    type="button"
                    aria-pressed={question.id === handoff.question.id}
                    className={`${styles.chip} ${question.id === handoff.question.id ? styles.chipOn : ''}`}
                    onClick={() => handoff.chooseQuestion(question.id)}
                  >
                    {question.chip}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.eyebrow}>How much of it</div>
              {handoff.canChooseScope ? (
                <div className={styles.seg}>
                  {handoff.scopes.map((scope) => (
                    <button
                      key={scope.id}
                      type="button"
                      aria-pressed={scope.id === handoff.scope.id}
                      className={`${styles.segItem} ${scope.id === handoff.scope.id ? styles.segItemOn : ''}`}
                      onClick={() => handoff.chooseScope(scope.id)}
                    >
                      {scope.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className={styles.scopeFixed}>All {handoff.totalWorkouts}</div>
              )}
            </div>

            <div className={styles.preview}>
              <div className={styles.previewHead}>
                <span className={styles.eyebrow}>Preview</span>
                <span className={styles.previewWords}>{handoff.words.toLocaleString()} words</span>
                <span className={styles.hair} />
                <button type="button" className={styles.expand} onClick={() => setExpanded((open) => !open)}>
                  {expanded ? 'COLLAPSE' : 'EXPAND'}
                </button>
              </div>
              <div className={`${styles.previewBody} ${expanded ? styles.previewBodyOpen : ''}`}>
                <pre className={styles.pre}>
                  {handoff.question.prompt && (
                    <span className={styles.preQuestion}>{handoff.question.prompt}{'\n\n'}</span>
                  )}
                  {handoff.bodyText}
                </pre>
              </div>
            </div>

            <div className={styles.foot}>
              <button type="button" className={styles.copyBtn} onClick={() => void handoff.copy()}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="12" height="12" rx="2.5" />
                  <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
                </svg>
                Copy my log
              </button>
              <div className={`${styles.trust} ${handoff.copyState === 'failed' ? styles.trustFailed : ''}`}>
                {handoff.copyState === 'failed'
                  ? 'Your browser blocked the clipboard — select the preview and copy it yourself.'
                  : 'Copied to your clipboard — wodi never sends this anywhere.'}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
