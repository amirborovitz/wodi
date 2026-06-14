import { forwardRef, Fragment } from 'react';
import styles from './StickerCard.module.css';
import type { RewardData, Exercise, ExerciseSet } from '../../types';
import {
  TRINITY,
  TRINITY_GLOW,
  type ShareSegmentType,
  type FunStat,
  detectExerciseDisplayType,
  formatTime,
  getCompletedSets,
  buildFunStats,
} from './shareCardUtils';

interface StickerCardProps {
  data: RewardData;
  userName?: string;
  segment: ShareSegmentType;
  exercises: Exercise[];  // pre-filtered exercises for this segment
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPeakWeight(exercise: Exercise): number {
  const weights = (exercise.sets || [])
    .map(s => s.weight)
    .filter((w): w is number => w != null && w > 0);
  return weights.length ? Math.max(...weights) : 0;
}

function formatStrengthCompact(sets: ExerciseSet[]): string[] {
  const weights = sets.map(s => s.weight).filter((w): w is number => w != null);
  const reps    = sets.map(s => s.actualReps).filter((r): r is number => r != null);
  const allSameWeight = weights.length > 0 && weights.every(w => w === weights[0]);
  const allSameReps   = reps.length > 0    && reps.every(r => r === reps[0]);

  if (allSameWeight && allSameReps && weights.length > 0) {
    return [`${sets.length} x ${reps[0]} @ ${weights[0]}kg`];
  }
  if (!allSameWeight && allSameReps && weights.length > 1 && reps.length > 0) {
    const unique = [...new Set(weights)];
    const display = unique.length <= 3
      ? unique.join(' \u27A4 ')
      : `${unique[0]} \u27A4 ... \u27A4 ${unique[unique.length - 1]}`;
    return [`${sets.length} x ${reps[0]}`, `${display}kg`];
  }
  const parts = sets.map(s => {
    const w = s.weight   != null ? `${s.weight}kg` : '';
    const r = s.actualReps != null ? `x ${s.actualReps}` : '';
    return [w, r].filter(Boolean).join(' ');
  }).filter(Boolean);
  const lines: string[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    lines.push(parts.slice(i, i + 3).join('  ·  '));
  }
  return lines;
}


function sectionColorForType(type: ReturnType<typeof detectExerciseDisplayType>): keyof typeof TRINITY {
  if (type === 'strength') return 'yellow';
  if (type === 'cardio')   return 'cyan';
  return 'magenta';
}

// ---------------------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------------------

export const StickerCard = forwardRef<HTMLDivElement, StickerCardProps>(
  function StickerCard({ data, userName, segment, exercises }, ref) {
    if (segment === 'story') {
      return <StoryCard ref={ref} data={data} userName={userName} exercises={exercises} />;
    }
    if (segment === 'strength') {
      return <StrengthCard ref={ref} data={data} userName={userName} exercises={exercises} />;
    }
    return <MetconCard ref={ref} data={data} userName={userName} exercises={exercises} />;
  }
);

// ---------------------------------------------------------------------------
// STORY CARD — full workout narrative with values
// ---------------------------------------------------------------------------

interface CardInnerProps {
  data: RewardData;
  userName?: string;
  exercises: Exercise[];
}

const StoryCard = forwardRef<HTMLDivElement, CardInnerProps>(
  function StoryCard({ data, userName, exercises }, ref) {
    const { workoutSummary } = data;
    const funStats = buildFunStats(data);

    // Group into sections by type
    interface Section {
      colorKey: keyof typeof TRINITY;
      label: string;
      exercises: Exercise[];
    }

    const sections: Section[] = [];
    let current: Section | null = null;

    for (const ex of exercises) {
      const type = detectExerciseDisplayType(ex);
      const colorKey = sectionColorForType(type);
      const sectionLabel =
        colorKey === 'yellow'  ? 'STRENGTH' :
        colorKey === 'cyan'    ? 'CARDIO'   :
                                 'METCON';
      if (!current || current.colorKey !== colorKey) {
        current = { colorKey, label: sectionLabel, exercises: [] };
        sections.push(current);
      }
      current.exercises.push(ex);
    }

    return (
      <div ref={ref} className={styles.root}>
        <div className={styles.glass}>
          <div className={styles.glowTop} aria-hidden="true" />
          <div className={styles.glowBottom} aria-hidden="true" />

          <header className={styles.header}>
            <div className={styles.headerTop}>
              <span className={styles.appName}>wodi</span>
              <span className={styles.headerMeta}>
                {userName ? `${userName}  ·  ` : ''}
                {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            </div>
            <h2 className={styles.workoutTitle}>{workoutSummary.title}</h2>
          </header>

          <div className={styles.sectionList}>
            {sections.map((section, si) => (
              <div key={si} className={styles.section}>
                <div className={styles.sectionHeader}>
                  <div
                    className={styles.sectionAccentBar}
                    style={{ background: TRINITY[section.colorKey] }}
                    aria-hidden="true"
                  />
                  <span
                    className={styles.sectionLabel}
                    style={{ color: TRINITY[section.colorKey] }}
                  >
                    {section.label}
                  </span>
                </div>

                {section.exercises.map((ex, ei) => (
                  <CompactExerciseRow key={ex.id || ei} exercise={ex} colorKey={section.colorKey} />
                ))}
              </div>
            ))}
          </div>

          {funStats.length > 0 && (
            <div className={styles.statsRow}>
              {funStats.map((stat, i) => (
                <StatChip key={i} {...stat} />
              ))}
            </div>
          )}

          <CardFooter />
        </div>
      </div>
    );
  }
);

// ---------------------------------------------------------------------------
// STRENGTH CARD — lifting detail with set-by-set bars
// ---------------------------------------------------------------------------

const StrengthCard = forwardRef<HTMLDivElement, CardInnerProps>(
  function StrengthCard({ data: _data, userName, exercises }, ref) {
    const color = TRINITY.yellow;
    const glow  = TRINITY_GLOW.yellow;

    // Compute aggregate stats
    const peakWeight = Math.max(...exercises.map(ex => getPeakWeight(ex)), 0);
    const totalSets = exercises.reduce((acc, ex) => acc + getCompletedSets(ex).length, 0);

    const stats: FunStat[] = [];
    if (peakWeight > 0) stats.push({ value: `${peakWeight}kg`, label: 'PEAK', color, glow });
    if (totalSets > 0)  stats.push({ value: `${totalSets}`, label: 'SETS', color, glow });

    return (
      <div ref={ref} className={styles.root}>
        <div className={styles.glass}>
          <div
            className={styles.glowTop}
            style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 70%)` }}
            aria-hidden="true"
          />
          <div className={styles.glowBottom} aria-hidden="true" />

          <div
            className={styles.accentStripe}
            style={{ background: `linear-gradient(90deg, ${color} 0%, transparent 100%)` }}
            aria-hidden="true"
          />

          <header className={styles.header}>
            <div className={styles.headerTop}>
              <span
                className={styles.exerciseTypeTag}
                style={{ color, borderColor: `${color}44`, background: `${color}10` }}
              >
                STRENGTH
              </span>
              <span className={styles.headerMeta}>
                {userName ? `${userName}  ·  ` : ''}wodi
              </span>
            </div>
          </header>

          <div className={styles.detailBody}>
            {exercises.map((ex, i) => {
              const sets = getCompletedSets(ex);
              return (
                <div key={ex.id || i} className={styles.strengthExerciseBlock}>
                  <span className={styles.strengthExerciseName}>{ex.name}</span>
                  <StrengthSetRows sets={sets} color={color} />
                </div>
              );
            })}
          </div>

          {stats.length > 0 && (
            <div className={styles.statsRow}>
              {stats.map((stat, i) => (
                <StatChip key={i} {...stat} />
              ))}
            </div>
          )}

          <CardFooter />
        </div>
      </div>
    );
  }
);

// ---------------------------------------------------------------------------
// METCON CARD — Instagram Story optimized: massive score hero + movement grid
// ---------------------------------------------------------------------------

const MetconCard = forwardRef<HTMLDivElement, CardInnerProps>(
  function MetconCard({ data, userName, exercises }, ref) {
    const color = TRINITY.magenta;
    const glow  = TRINITY_GLOW.magenta;

    const primaryEx = exercises.find(ex => {
      const t = detectExerciseDisplayType(ex);
      return t === 'for_time' || t === 'amrap';
    }) || exercises[0];

    const exType = primaryEx ? detectExerciseDisplayType(primaryEx) : 'for_time';
    const sets = primaryEx ? getCompletedSets(primaryEx) : [];

    // Detect interval splits
    const splitTimes = sets.map(s => s.time).filter((t): t is number => t != null && t > 0);
    const isInterval = splitTimes.length > 1;
    const splitAvg  = isInterval ? Math.round(splitTimes.reduce((a, b) => a + b, 0) / splitTimes.length) : 0;
    const splitBest = isInterval ? Math.min(...splitTimes) : 0;

    // Score hero
    let scoreText  = '';
    let scoreLabel = '';
    if (isInterval) {
      scoreText  = formatTime(splitAvg);
      scoreLabel = `AVG SPLIT  ·  BEST ${formatTime(splitBest)}`;
    } else if (exType === 'for_time') {
      const timeSet = sets.find(s => s.time != null && s.time > 0);
      scoreText  = timeSet ? formatTime(timeSet.time || 0) : '';
      scoreLabel = 'FINAL TIME';
    } else if (exType === 'amrap') {
      const rounds  = primaryEx?.rounds || sets.filter(s => s.completed).length;
      const lastSet = sets[sets.length - 1];
      const extra   = lastSet?.actualReps || 0;
      scoreText  = rounds > 0 ? `${rounds}` : '';
      scoreLabel = extra > 0 ? `ROUNDS + ${extra} REPS` : 'ROUNDS';
    } else if (exType === 'cardio') {
      const totalCal  = sets.reduce((acc, s) => acc + (s.calories || 0), 0);
      const totalDist = sets.reduce((acc, s) => acc + (s.distance || 0), 0);
      if (totalCal > 0) { scoreText = `${totalCal}`; scoreLabel = 'CAL'; }
      else if (totalDist > 0) {
        scoreText  = totalDist >= 1000 ? `${(totalDist / 1000).toFixed(1)}` : `${totalDist}`;
        scoreLabel = totalDist >= 1000 ? 'KM' : 'M';
      }
    }

    const formatTag = isInterval ? 'INTERVAL' : exType === 'amrap' ? 'AMRAP' : exType === 'cardio' ? 'CARDIO' : 'FOR TIME';
    const movements = primaryEx?.movements || [];
    const cardTitle = primaryEx?.name || 'Metcon';

    // EP estimate: base + time bonus + PR bonus
    const teamSize = data.teamSize && data.teamSize > 1 ? data.teamSize : 1;
    const epEstimate = Math.round(
      10 +
      (data.workoutSummary.duration || 0) * 3 +
      (data.heroAchievement?.type === 'pr' ? 25 : 0)
    );

    // Output: distance → cals → reps
    const totalDist = Math.round((data.workloadBreakdown?.grandTotalDistance || 0) / teamSize);
    const totalCals = Math.round(exercises.reduce((acc, ex) =>
      acc + (ex.sets || []).reduce((a, s) => a + (s.calories || 0), 0), 0) / teamSize);
    const totalReps = Math.round(exercises.reduce((acc, ex) =>
      acc + (ex.sets || []).reduce((a, s) => a + (s.actualReps || 0), 0), 0) / teamSize);

    let outputText  = '';
    let outputLabel = '';
    if (totalDist > 0) {
      outputText  = totalDist >= 1000 ? `${(totalDist / 1000).toFixed(1)} KM` : `${totalDist} M`;
      outputLabel = 'DISTANCE';
    } else if (totalCals > 0) {
      outputText  = `${totalCals} CAL`;
      outputLabel = 'OUTPUT';
    } else if (totalReps > 0) {
      outputText  = `${totalReps}`;
      outputLabel = 'REPS';
    }

    const solidLabel = data.heroAchievement?.type === 'pr' ? 'NEW PR!' : 'SOLID!';

    return (
      <div ref={ref} className={styles.root}>
        <div className={styles.glass}>
          <div
            className={styles.glowTop}
            style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 70%)` }}
            aria-hidden="true"
          />
          <div className={styles.glowBottom} aria-hidden="true" />
          <div
            className={styles.accentStripe}
            style={{ background: `linear-gradient(90deg, ${color} 0%, transparent 100%)` }}
            aria-hidden="true"
          />

          {/* Header: eyebrow label + workout name */}
          <header className={styles.header}>
            <div className={styles.headerTop}>
              <span className={styles.typeEyebrow} style={{ color }}>{formatTag}</span>
              <span className={styles.headerMeta}>{userName ? `${userName}  ·  ` : ''}wodi</span>
            </div>
            <h2 className={styles.cardTitle}>{cardTitle}</h2>
          </header>

          {/* Score hero — massive focal point */}
          {scoreText && (
            <div className={styles.scoreBlock}>
              <span
                className={styles.scoreHero}
                style={{ color, textShadow: `0 0 32px ${color}44` }}
              >
                {scoreText}
              </span>
              <span className={styles.scoreLabel}>{scoreLabel}</span>
            </div>
          )}

          {/* Movement list — 2-column grid with format sticker */}
          {movements.length > 0 && (
            <div className={styles.movementBlock}>
              <div className={styles.movementBlockHeader}>
                <span className={styles.movementsEyebrow}>
                  {primaryEx?.rounds && primaryEx.rounds > 1 ? `${primaryEx.rounds} rounds` : 'movements'}
                </span>
                <div className={styles.formatSticker} style={{ background: color }}>
                  <span className={styles.formatStickerText}>{formatTag}</span>
                </div>
              </div>
              <div className={styles.movementGrid}>
                {movements.map((m, i) => {
                  const qty =
                    m.reps != null     ? `${m.reps}`
                    : m.distance != null ? m.distance >= 1000 ? `${m.distance / 1000}k` : `${m.distance}m`
                    : m.calories != null ? `${m.calories}`
                    : '—';
                  return (
                    <Fragment key={i}>
                      <span className={styles.movementQty} style={{ color }}>{qty}</span>
                      <span className={styles.movementName}>{m.name}</span>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {/* Data bar — EFFORT + OUTPUT + SOLID */}
          <div className={styles.dataBar}>
            <div className={styles.dataBarItem}>
              <span className={styles.dataBarValue}>{epEstimate} pts</span>
              <span className={styles.dataBarLabel}>EFFORT</span>
            </div>
            {outputText && (
              <div className={styles.dataBarItem}>
                <span className={styles.dataBarValue}>{outputText}</span>
                <span className={styles.dataBarLabel}>{outputLabel}</span>
              </div>
            )}
            <span className={styles.solidText}>{solidLabel}</span>
          </div>

          <CardFooter />
        </div>
      </div>
    );
  }
);

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CompactExerciseRow({ exercise, colorKey }: { exercise: Exercise; colorKey: keyof typeof TRINITY }) {
  const type  = detectExerciseDisplayType(exercise);
  const sets  = getCompletedSets(exercise);
  const color = TRINITY[colorKey];

  return (
    <div className={styles.compactRow}>
      <span className={styles.compactName}>{exercise.name}</span>
      <div className={styles.compactData}>
        {type === 'strength' && <StrengthCompact sets={sets} color={color} />}
        {(type === 'for_time' || type === 'amrap') && (
          <MetconCompact exercise={exercise} type={type} color={color} />
        )}
        {type === 'cardio' && <CardioCompact sets={sets} />}
        {type === 'bodyweight' && <BodyweightCompact sets={sets} exercise={exercise} />}
      </div>
    </div>
  );
}

function StrengthCompact({ sets, color }: { sets: ExerciseSet[]; color: string }) {
  const lines = formatStrengthCompact(sets);
  return (
    <div className={styles.compactLines}>
      {lines.map((line, i) => (
        <span
          key={i}
          className={i === 0 ? styles.compactPrimary : styles.compactSecondary}
          style={i === 0 ? { color } : undefined}
        >
          {line}
        </span>
      ))}
    </div>
  );
}

function MetconCompact({ exercise, type, color }: { exercise: Exercise; type: 'for_time' | 'amrap'; color: string }) {
  const sets = getCompletedSets(exercise);
  const scoreText =
    type === 'for_time'
      ? (() => { const t = sets.find(s => s.time != null && s.time > 0); return t ? formatTime(t.time || 0) : ''; })()
      : (() => {
          // Prefer exercise.rounds (story logging stores rounds there, not as individual sets)
          const rounds = exercise.rounds || sets.filter(s => s.completed).length;
          const lastSet = sets[sets.length - 1];
          const extra = lastSet?.actualReps || 0;
          return rounds > 0 ? `${rounds} rds${extra > 0 ? ` + ${extra}` : ''}` : '';
        })();
  const movements = exercise.movements || [];

  return (
    <div className={styles.compactLines}>
      {scoreText && <span className={styles.compactPrimary} style={{ color }}>{scoreText}</span>}
      {movements.length > 0 ? (
        <span className={styles.compactSecondary}>
          {movements.map(m => {
            const parts: string[] = [];
            if (m.reps)     parts.push(`${m.reps}`);
            if (m.distance) parts.push(`${m.distance}m`);
            parts.push(m.name);
            return parts.join(' ');
          }).join('  ·  ')}
        </span>
      ) : exercise.prescription ? (
        <span className={styles.compactSecondary}>{exercise.prescription}</span>
      ) : null}
    </div>
  );
}

function CardioCompact({ sets }: { sets: ExerciseSet[] }) {
  const totalCal  = sets.reduce((acc, s) => acc + (s.calories || 0), 0);
  const totalDist = sets.reduce((acc, s) => acc + (s.distance || 0), 0);
  const display   = totalCal > 0 ? `${totalCal} cal` : totalDist > 0 ? `${totalDist}m` : '';
  return display ? (
    <span className={styles.compactPrimary} style={{ color: TRINITY.cyan }}>{display}</span>
  ) : null;
}

function BodyweightCompact({ sets, exercise }: { sets: ExerciseSet[]; exercise: Exercise }) {
  const repLines = sets.map(s => s.actualReps != null ? `${s.actualReps}` : '').filter(Boolean);
  const text = repLines.length > 0 ? repLines.join(' · ') + ' reps' : exercise.prescription || '';
  return <span className={styles.compactSecondary}>{text}</span>;
}

function StrengthSetRows({ sets, color }: { sets: ExerciseSet[]; color: string }) {
  const weights   = sets.map(s => s.weight).filter((w): w is number => w != null && w > 0);
  const maxWeight = weights.length ? Math.max(...weights) : 1;
  const minWeight = weights.length ? Math.min(...weights) : 0;
  const range     = maxWeight - minWeight;

  return (
    <div className={styles.strengthRows}>
      {sets.map((s, i) => {
        const w = s.weight ?? null;
        const r = s.actualReps ?? null;
        const barPct = w != null && maxWeight > 0
          ? range === 0 ? 80 : 50 + Math.round(((w - minWeight) / range) * 45)
          : 0;

        return (
          <div key={s.id || i} className={styles.strengthSetRow}>
            <span className={styles.setIndex}>{String(s.setNumber || i + 1).padStart(2, '0')}</span>
            <span className={styles.setWeight} style={{ color }}>{w != null ? `${w}kg` : '\u2014'}</span>
            <span className={styles.setReps}>{r != null ? `x ${r}` : ''}</span>
            <div className={styles.setBarTrack}>
              <div
                className={styles.setBarFill}
                style={{ width: `${barPct}%`, background: color, boxShadow: `0 0 6px ${color}66` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatChip({ value, label, color, glow, highlight = false }: FunStat) {
  return (
    <div
      className={styles.statChip}
      style={
        highlight
          ? { background: `${color}14`, borderColor: `${color}44`, boxShadow: `0 0 12px ${glow}` }
          : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }
      }
    >
      <span className={styles.statChipValue} style={{ color, textShadow: `0 0 8px ${glow}` }}>
        {value}
      </span>
      <span className={styles.statChipLabel}>{label}</span>
    </div>
  );
}

function CardFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerLine} aria-hidden="true" />
      <span className={styles.footerBrand}>wodi</span>
    </footer>
  );
}
