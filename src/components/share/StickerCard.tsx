import { forwardRef } from 'react';
import styles from './StickerCard.module.css';
import type { RewardData, Exercise, ExerciseSet, ParsedMovement } from '../../types';
import {
  TRINITY,
  TRINITY_GLOW,
  type ShareSegmentType,
  type FunStat,
  detectExerciseDisplayType,
  formatTime,
  formatVolume,
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

function computeExerciseVolume(exercise: Exercise): number {
  return (exercise.sets || []).reduce((acc, s) => {
    if (s.weight && s.actualReps) return acc + s.weight * s.actualReps;
    return acc;
  }, 0);
}

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

function formatMovement(m: ParsedMovement): string {
  const parts: string[] = [];
  if (m.reps)     parts.push(`${m.reps}`);
  if (m.distance) parts.push(m.distance >= 1000 ? `${m.distance / 1000}km` : `${m.distance}m`);
  if (m.calories) parts.push(`${m.calories} cal`);
  parts.push(m.name);
  if (m.rxWeights) {
    const w = m.rxWeights;
    if (w.female && w.male && w.female !== w.male) {
      parts.push(`@ ${w.female}/${w.male}${w.unit || 'kg'}`);
    } else {
      const wt = w.male || w.female;
      if (wt) parts.push(`@ ${wt}${w.unit || 'kg'}`);
    }
  }
  return parts.join(' ');
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
    const totalVol = exercises.reduce((acc, ex) => acc + computeExerciseVolume(ex), 0);
    const peakWeight = Math.max(...exercises.map(ex => getPeakWeight(ex)), 0);
    const totalSets = exercises.reduce((acc, ex) => acc + getCompletedSets(ex).length, 0);

    const stats: FunStat[] = [];
    if (peakWeight > 0) stats.push({ value: `${peakWeight}kg`, label: 'PEAK', color, glow });
    if (totalVol > 0)   stats.push({ value: formatVolume(totalVol), label: 'VOL', color, glow });
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
// METCON CARD — score as hero, movement list
// ---------------------------------------------------------------------------

const MetconCard = forwardRef<HTMLDivElement, CardInnerProps>(
  function MetconCard({ data: _data, userName, exercises }, ref) {
    const color = TRINITY.magenta;
    const glow  = TRINITY_GLOW.magenta;

    // Find the primary metcon exercise (first for_time or amrap)
    const primaryEx = exercises.find(ex => {
      const t = detectExerciseDisplayType(ex);
      return t === 'for_time' || t === 'amrap';
    }) || exercises[0];

    const exType = primaryEx ? detectExerciseDisplayType(primaryEx) : 'for_time';
    const sets = primaryEx ? getCompletedSets(primaryEx) : [];

    // Score computation
    let scoreText = '';
    let scoreLabel = '';

    if (exType === 'for_time') {
      const timeSet = sets.find(s => s.time != null && s.time > 0);
      scoreText = timeSet ? formatTime(timeSet.time || 0) : '';
      scoreLabel = 'COMPLETED';
    } else if (exType === 'amrap') {
      const rounds  = sets.filter(s => s.completed).length;
      const lastSet = sets[sets.length - 1];
      const extra   = lastSet?.actualReps || 0;
      scoreText = rounds > 0 ? `${rounds} rds${extra > 0 ? ` + ${extra}` : ''}` : '';
      scoreLabel = 'SCORE';
    } else if (exType === 'cardio') {
      const totalCal  = sets.reduce((acc, s) => acc + (s.calories || 0), 0);
      const totalDist = sets.reduce((acc, s) => acc + (s.distance || 0), 0);
      if (totalCal > 0) { scoreText = `${totalCal}`; scoreLabel = 'CAL'; }
      else if (totalDist > 0) {
        scoreText = totalDist >= 1000 ? `${(totalDist / 1000).toFixed(1)}` : `${totalDist}`;
        scoreLabel = totalDist >= 1000 ? 'KM' : 'M';
      }
    }

    // Movements from primary exercise
    const movements = primaryEx?.movements || [];

    // Rx tag
    const rxWeights = primaryEx?.rxWeights;
    const rxLabel = rxWeights
      ? rxWeights.female && rxWeights.male && rxWeights.female !== rxWeights.male
        ? `Rx ${rxWeights.female}/${rxWeights.male}kg`
        : `Rx ${rxWeights.male || rxWeights.female}kg`
      : null;

    // Prescription fallback
    const prescriptionLines = !movements.length && primaryEx?.prescription
      ? primaryEx.prescription.split(/\n|(?:\s*;\s*)/).map(l => l.trim()).filter(Boolean)
      : [];

    // Metcon-specific stats
    const metconStats: FunStat[] = [];
    const totalReps = exercises.reduce((acc, ex) => {
      return acc + (ex.sets || []).reduce((a, s) => a + (s.actualReps || 0), 0);
    }, 0);
    const totalDist = exercises.reduce((acc, ex) => {
      return acc + (ex.sets || []).reduce((a, s) => a + (s.distance || 0), 0);
    }, 0);
    const totalCals = exercises.reduce((acc, ex) => {
      return acc + (ex.sets || []).reduce((a, s) => a + (s.calories || 0), 0);
    }, 0);

    if (totalReps > 0) metconStats.push({ value: `${totalReps}`, label: 'REPS', color, glow });
    if (totalDist > 0) {
      metconStats.push({
        value: totalDist >= 1000 ? `${(totalDist / 1000).toFixed(1)}km` : `${Math.round(totalDist)}m`,
        label: 'DIST', color: TRINITY.cyan, glow: TRINITY_GLOW.cyan,
      });
    }
    if (totalCals > 0) metconStats.push({ value: `${totalCals}`, label: 'CAL', color, glow });

    // Card title: exercise name or primary exercise name
    const cardTitle = primaryEx?.name || 'Metcon';

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
                {exType === 'amrap' ? 'AMRAP' : exType === 'cardio' ? 'CARDIO' : 'FOR TIME'}
              </span>
              <span className={styles.headerMeta}>
                {userName ? `${userName}  ·  ` : ''}wodi
              </span>
            </div>
            <h2 className={styles.singleExerciseTitle}>{cardTitle}</h2>
          </header>

          <div className={styles.detailBody}>
            <div className={styles.metconDetail}>
              {/* Big score hero */}
              {scoreText ? (
                <div className={styles.metconScoreBlock}>
                  <span className={styles.metconScoreValue} style={{ color, textShadow: `0 0 20px ${color}66` }}>
                    {scoreText}
                  </span>
                  <span className={styles.metconScoreLabel}>{scoreLabel}</span>
                </div>
              ) : null}

              {/* Rx tag */}
              {rxLabel && (
                <span
                  className={styles.rxTag}
                  style={{ color, borderColor: `${color}44`, background: `${color}10` }}
                >
                  {rxLabel}
                </span>
              )}

              {/* Movement list */}
              {movements.length > 0 ? (
                <div className={styles.movementList}>
                  {primaryEx?.rounds && primaryEx.rounds > 1 && (
                    <span className={styles.movementRoundsLine}>
                      {primaryEx.rounds} rounds:
                    </span>
                  )}
                  {movements.map((m, i) => (
                    <div key={i} className={styles.movementLine}>
                      <span className={styles.movementDot} style={{ color }}>·</span>
                      <span className={styles.movementText}>{formatMovement(m)}</span>
                    </div>
                  ))}
                </div>
              ) : prescriptionLines.length > 0 ? (
                <div className={styles.movementList}>
                  {prescriptionLines.map((line, i) => (
                    <span key={i} className={styles.movementText}>{line}</span>
                  ))}
                </div>
              ) : null}

              {/* Additional exercises beyond primary */}
              {exercises.length > 1 && (
                <div className={styles.additionalExercises}>
                  {exercises.filter(ex => ex !== primaryEx).map((ex, i) => {
                    const t = detectExerciseDisplayType(ex);
                    const c = TRINITY[sectionColorForType(t)];
                    return (
                      <div key={ex.id || i} className={styles.additionalExRow}>
                        <span className={styles.additionalExName}>{ex.name}</span>
                        <span className={styles.additionalExDetail} style={{ color: c }}>
                          {getExerciseQuickSummary(ex, t)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {metconStats.length > 0 && (
            <div className={styles.statsRow}>
              {metconStats.map((stat, i) => (
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
// Quick one-line summary for additional exercises
// ---------------------------------------------------------------------------

function getExerciseQuickSummary(ex: Exercise, type: ReturnType<typeof detectExerciseDisplayType>): string {
  const sets = getCompletedSets(ex);
  if (type === 'for_time') {
    const timeSet = sets.find(s => s.time != null && s.time > 0);
    return timeSet ? formatTime(timeSet.time || 0) : ex.prescription || '';
  }
  if (type === 'amrap') {
    const rounds = sets.filter(s => s.completed).length;
    const lastSet = sets[sets.length - 1];
    const extra = lastSet?.actualReps || 0;
    return rounds > 0 ? `${rounds} rds${extra > 0 ? ` + ${extra}` : ''}` : '';
  }
  if (type === 'cardio') {
    const totalCal = sets.reduce((acc, s) => acc + (s.calories || 0), 0);
    const totalDist = sets.reduce((acc, s) => acc + (s.distance || 0), 0);
    return totalCal > 0 ? `${totalCal} cal` : totalDist > 0 ? `${totalDist}m` : '';
  }
  const totalReps = sets.reduce((acc, s) => acc + (s.actualReps || 0), 0);
  return totalReps > 0 ? `${totalReps} reps` : '';
}

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
          const rounds = sets.filter(s => s.completed).length;
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
