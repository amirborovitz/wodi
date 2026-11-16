import React from 'react';
import { BodyFigure, BodyTally, type BodyRamp } from '../body/BodyFigure';
import type { WeekSoFarStrip as WeekSoFarStripData } from '../../hooks/useWeekSoFarStrip';
import styles from './WeekSoFarStrip.module.css';

interface WeekSoFarStripProps {
  week: WeekSoFarStripData;
}

/** Dark amber to full yellow on the card surface. */
const RAMP: BodyRamp = ['rgba(243, 241, 234, 0.10)', '#8C700C', '#C9A107', '#F5C200'];

/**
 * "This week" on Today: time moving and sessions, then the body lit by what you trained
 * beside the list of those parts with a bar per session.
 *
 * Grow-only — it appears with the week's first workout and only ever gains. Nothing on
 * it counts what's missing: an untouched part is simply quiet, and the list names only
 * what was trained.
 */
export function WeekSoFarStrip({ week }: WeekSoFarStripProps): React.JSX.Element {
  return (
    <section className={styles.strip} aria-label="This week so far">
      <div className={styles.top}>
        <div className={styles.numbers}>
          <span className={styles.eyebrow}>This week</span>
          <div className={styles.heroRow}>
            <span className={styles.hero}>{week.hero}</span>
            <span className={styles.heroUnit}>{week.heroUnit}</span>
          </div>
        </div>
        {week.sessions && (
          <div className={styles.heroRow}>
            <span className={styles.count}>{week.sessions.count}</span>
            <span className={styles.heroUnit}>{week.sessions.unit}</span>
          </div>
        )}
      </div>
      {week.body && (
        <div className={styles.body}>
          <BodyFigure sessions={week.body.sessions} height={96} ramp={RAMP} labelFont="'DM Mono', monospace" labelSize={8} labelColor="rgba(243, 241, 234, 0.38)" />
          <BodyTally
            rows={week.body.tally}
            nameFont="'Barlow Condensed', sans-serif"
            nameSize={15}
            nameColor="#f3f1ea"
            pipWidth={16}
            pipHeight={7}
            ramp={RAMP}
            gap={9}
          />
        </div>
      )}
    </section>
  );
}
