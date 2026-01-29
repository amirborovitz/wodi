import { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { RewardData } from '../../types';
import { elementToCanvas, canvasToBlob, downloadBlob, shareImage } from '../../utils/shareUtils';
import styles from './StoryStudioSheet.module.css';

type StoryTemplate = 'evolution' | 'minimalist' | 'heavy';

interface StoryStudioSheetProps {
  open: boolean;
  onClose: () => void;
  data: RewardData;
  userName?: string;
}

const templateOptions: Array<{ id: StoryTemplate; label: string }> = [
  { id: 'evolution', label: 'Evolution' },
  { id: 'minimalist', label: 'Minimalist' },
  { id: 'heavy', label: 'Heavy Hitter' },
];

function normalizeWorkoutText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function buildWorkoutDescription(data: RewardData): string {
  if (data.workoutRawText) return normalizeWorkoutText(data.workoutRawText);
  if (data.workoutContext) return data.workoutContext;
  const lines = data.exercises.map((exercise) => {
    const parts = [exercise.name, exercise.prescription].filter(Boolean);
    return parts.join(' — ');
  });
  return lines.join(' | ');
}

function buildOriginalWodText(data: RewardData): string {
  if (data.workoutRawText) return normalizeWorkoutText(data.workoutRawText);
  if (data.workoutContext) return data.workoutContext;
  return data.exercises
    .map((exercise) => [exercise.name, exercise.prescription].filter(Boolean).join(' '))
    .join(' · ');
}

function WodiIcon() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={styles.brandIcon}>
      <rect width="40" height="40" rx="10" fill="url(#wodiGradient)" />
      <path
        d="M10 28L14 12H18L20 22L22 12H26L30 28H26L24 18L22 28H18L16 18L14 28H10Z"
        fill="white"
      />
      <defs>
        <linearGradient id="wodiGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00F2FF" />
          <stop offset="0.5" stopColor="#FF00E5" />
          <stop offset="1" stopColor="#FFD600" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function StoryCanvas({
  template,
  description,
  title,
  stats,
  userName,
  originalText,
  size = 'preview',
}: {
  template: StoryTemplate;
  description: string;
  title: string;
  stats: Array<{ label: string; value: string }>;
  userName?: string;
  originalText: string;
  size?: 'preview' | 'full';
}) {
  return (
    <div
      className={`${styles.storyCanvas} ${styles[`story-${template}`]} ${styles[`story-${size}`]}`}
    >
      <div className={styles.storyGlow} />
      <header className={styles.storyHeader}>
        <div className={styles.brandRow}>
          <WodiIcon />
          <span className={styles.brandName}>
            wodi{userName ? ` | ${userName}` : ''}
          </span>
        </div>
        <span className={styles.storyTag}>Workout Complete</span>
      </header>

      <section className={styles.storyHero}>
        <h1 className={styles.storyTitle}>{title}</h1>
        <p className={styles.storyDescription}>{description}</p>
      </section>

      <section className={styles.storyStats}>
        {stats.map((stat) => (
          <div key={stat.label} className={styles.storyStat}>
            <span className={styles.storyStatValue}>{stat.value}</span>
            <span className={styles.storyStatLabel}>{stat.label}</span>
          </div>
        ))}
      </section>

      {template === 'heavy' && (
        <section className={styles.storyOriginal}>
          <p className={styles.storyOriginalText}>{originalText}</p>
        </section>
      )}

      <div className={styles.storyWatermark}>wodi</div>
    </div>
  );
}

export function StoryStudioSheet({ open, onClose, data, userName }: StoryStudioSheetProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<StoryTemplate>('evolution');
  const [isSharing, setIsSharing] = useState(false);
  const fullCanvasRef = useRef<HTMLDivElement>(null);

  const description = useMemo(() => buildWorkoutDescription(data), [data]);
  const originalText = useMemo(() => buildOriginalWodText(data), [data]);
  const stats = useMemo(() => {
    const volume = data.workoutSummary.totalVolume;
    const volumeText = volume >= 1000
      ? `${(volume / 1000).toFixed(2)} tons`
      : `${Math.round(volume).toLocaleString()} kg`;
    return [
      { label: 'Volume', value: volumeText },
      { label: 'Time', value: `${Math.round(data.workoutSummary.duration)} min` },
      { label: 'Reps', value: `${data.workoutSummary.totalReps}` },
    ];
  }, [data]);

  const handleShare = async () => {
    if (!fullCanvasRef.current || isSharing) return;
    setIsSharing(true);
    try {
      const canvas = await elementToCanvas(fullCanvasRef.current, { scale: 1, width: 1080, height: 1920 });
      const blob = await canvasToBlob(canvas, 'png', 0.95);
      const shared = await shareImage(blob, 'Wodi Story');
      if (!shared) {
        downloadBlob(blob, `wodi-story-${Date.now()}.png`);
      }
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className={styles.sheet}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.sheetHandle} />
            <div className={styles.sheetHeader}>
              <h3 className={styles.sheetTitle}>Story Studio</h3>
              <button className={styles.closeButton} onClick={onClose} type="button">
                Close
              </button>
            </div>

            <div className={styles.previewGrid}>
              {templateOptions.map((template) => (
                <button
                  key={template.id}
                  className={`${styles.previewCard} ${selectedTemplate === template.id ? styles.previewActive : ''}`}
                  onClick={() => setSelectedTemplate(template.id)}
                  type="button"
                >
                  <StoryCanvas
                    template={template.id}
                    description={description}
                    title={data.workoutSummary.title}
                    stats={stats}
                    userName={userName}
                    originalText={originalText}
                  />
                  <span className={styles.previewLabel}>{template.label}</span>
                </button>
              ))}
            </div>

            <div className={styles.sheetActions}>
              <button
                className={styles.shareButton}
                type="button"
                onClick={handleShare}
                disabled={isSharing}
              >
                {isSharing ? 'Preparing Story…' : 'Share to Instagram Stories'}
              </button>
            </div>
          </motion.div>

          <div className={styles.hiddenCanvas} aria-hidden="true">
            <div ref={fullCanvasRef}>
              <StoryCanvas
                template={selectedTemplate}
                description={description}
                title={data.workoutSummary.title}
                stats={stats}
                userName={userName}
                originalText={originalText}
                size="full"
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
