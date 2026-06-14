import type { ArtifactSection } from './types';

type ClassMap = Record<string, string>;

interface ArtifactSectionViewProps {
  section: ArtifactSection;
  index: number;
  styles: ClassMap;
}

export function ArtifactSectionView({ section, index, styles }: ArtifactSectionViewProps) {
  return (
    <section key={`${section.title}-${index}`} className={`${styles.artifactSection} ${section.watermark ? styles.artifactSectionComplex : ''}`}>
      <div className={styles.artifactHeader}>
        {section.eyebrow && section.eyebrow.toUpperCase() !== 'WOD' && (
          <span className={styles.artifactEyebrow}>{section.eyebrow}</span>
        )}
        <h3 className={styles.artifactBlueprint}>{section.blueprint || section.title}</h3>
        {section.blueprintSub && (
          <p className={styles.artifactBlueprintSub}>{section.blueprintSub}</p>
        )}
      </div>

      <div className={styles.artifactRows}>
        {section.rows.map((row, rowIndex) => {
          const accentClass = row.accent === 'yellow' ? styles.artifactPrimaryYellow
            : row.accent === 'cyan' ? styles.artifactPrimaryCyan
            : styles.artifactPrimaryMagenta;
          const displayName = row.nameWithLoad ?? row.name;
          const loadMatch = displayName.match(/^(.*?)(\s+@\s*.+)$/);
          const primaryAccentClass = loadMatch && /^\d/.test(row.primary)
            ? styles.artifactPrimaryMagenta
            : accentClass;

          if (row.roundLabel != null) {
            return (
              <div key={`${row.name}-${rowIndex}`} className={styles.artifactRoundRow}>
                <span className={styles.artifactRoundLabel}>{row.roundLabel}</span>
                <span className={styles.artifactRoundMovement}>{row.primary}</span>
                {row.subNote
                  ? <span className={styles.artifactRoundWeight}>{row.subNote}</span>
                  : <span />
                }
              </div>
            );
          }

          if (row.stationRow) {
            return (
              <div key={`${row.name}-${rowIndex}`} className={styles.artifactStationRow}>
                <span className={styles.artifactStationLabel}>{row.name}</span>
                <span className={`${styles.artifactStationResult} ${accentClass}`}>
                  {row.primary}
                </span>
                {row.subNote && (
                  <span className={styles.artifactStationTotal}>{row.subNote}</span>
                )}
              </div>
            );
          }

          return (
            <div key={`${row.name}-${rowIndex}`} className={styles.artifactRow}>
              <div className={styles.artifactRowMain}>
                <span className={`${styles.artifactPrimary} ${primaryAccentClass}`}>
                  {row.primary}
                </span>
                <span className={styles.artifactName}>
                  {loadMatch ? (
                    <>
                      {loadMatch[1]}
                      <span className={styles.artifactInlineLoad}>{loadMatch[2]}</span>
                    </>
                  ) : displayName}
                </span>
              </div>
              {row.subNote && <span className={styles.artifactSubNote}>{row.subNote}</span>}
            </div>
          );
        })}
        {section.hiddenCount ? (
          <span className={styles.artifactContinuation}>
            +{section.hiddenCount} open lane{section.hiddenCount > 1 ? 's' : ''}
          </span>
        ) : null}
      </div>
    </section>
  );
}

