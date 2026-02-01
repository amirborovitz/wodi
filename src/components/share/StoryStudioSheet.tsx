import { useMemo, useRef, useState, useEffect } from 'react';
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

const templateOptions: Array<{ id: StoryTemplate; label: string; description: string }> = [
  { id: 'evolution', label: 'Evolution', description: 'Clean & modern' },
  { id: 'minimalist', label: 'Minimalist', description: 'Simple focus' },
  { id: 'heavy', label: 'Heavy Hitter', description: 'Bold impact' },
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

// Icons
function CloseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSharing, setIsSharing] = useState(false);
  const fullCanvasRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  const description = useMemo(() => buildWorkoutDescription(data), [data]);
  const originalText = useMemo(() => buildOriginalWodText(data), [data]);
  const stats = useMemo(() => {
    const volume = data.workoutSummary.totalVolume;
    const volumeText = volume >= 1000
      ? `${(volume / 1000).toFixed(2)} tons`
      : `${Math.round(volume).toLocaleString()} kg`;
    return [
      { label: 'Volume', value: volumeText },
      { label: 'Metcon Time', value: `${Math.round(data.workoutSummary.duration)} min` },
      { label: 'Reps', value: `${data.workoutSummary.totalReps}` },
    ];
  }, [data]);

  // Handle carousel scroll to update active index
  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const handleScroll = () => {
      const scrollLeft = carousel.scrollLeft;
      const itemWidth = carousel.offsetWidth;
      const newIndex = Math.round(scrollLeft / itemWidth);
      setActiveIndex(newIndex);
      setSelectedTemplate(templateOptions[newIndex]?.id || 'evolution');
    };

    carousel.addEventListener('scroll', handleScroll);
    return () => carousel.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToIndex = (index: number) => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const itemWidth = carousel.offsetWidth;
    carousel.scrollTo({ left: index * itemWidth, behavior: 'smooth' });
  };

  const generateImage = async (): Promise<Blob | null> => {
    if (!fullCanvasRef.current) return null;
    const canvas = await elementToCanvas(fullCanvasRef.current, { scale: 1, width: 1080, height: 1920 });
    return canvasToBlob(canvas, 'png', 0.95);
  };

  const handleShare = async (platform: 'instagram' | 'whatsapp' | 'tiktok' | 'system') => {
    if (isSharing) return;
    setIsSharing(true);

    try {
      const blob = await generateImage();
      if (!blob) return;

      // For all platforms, we use the Web Share API or download
      // Platform-specific deep linking would require native app integration
      const shared = await shareImage(blob, 'Wodi Workout');
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
        >
          <motion.div
            className={styles.studio}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          >
            {/* Header */}
            <header className={styles.studioHeader}>
              <h2 className={styles.studioTitle}>Share Studio</h2>
              <button className={styles.closeBtn} onClick={onClose} type="button" aria-label="Close">
                <CloseIcon />
              </button>
            </header>

            {/* Template Carousel */}
            <div className={styles.carouselContainer}>
              <div className={styles.carousel} ref={carouselRef}>
                {templateOptions.map((template, index) => (
                  <div
                    key={template.id}
                    className={`${styles.carouselItem} ${activeIndex === index ? styles.carouselItemActive : ''}`}
                    onClick={() => scrollToIndex(index)}
                  >
                    <StoryCanvas
                      template={template.id}
                      description={description}
                      title={data.workoutSummary.title}
                      stats={stats}
                      userName={userName}
                      originalText={originalText}
                    />
                    <div className={styles.templateInfo}>
                      <span className={styles.templateLabel}>{template.label}</span>
                      <span className={styles.templateDesc}>{template.description}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Page Indicator Dots */}
              <div className={styles.pageIndicator}>
                {templateOptions.map((_, index) => (
                  <button
                    key={index}
                    className={`${styles.dot} ${activeIndex === index ? styles.dotActive : ''}`}
                    onClick={() => scrollToIndex(index)}
                    aria-label={`Go to template ${index + 1}`}
                  />
                ))}
              </div>
            </div>

            {/* Platform Bar */}
            <div className={styles.platformBar}>
              <button
                className={styles.platformBtn}
                onClick={() => handleShare('instagram')}
                disabled={isSharing}
                type="button"
              >
                <div className={styles.platformIcon}>
                  <InstagramIcon />
                </div>
                <span className={styles.platformLabel}>Stories</span>
              </button>

              <button
                className={styles.platformBtn}
                onClick={() => handleShare('whatsapp')}
                disabled={isSharing}
                type="button"
              >
                <div className={styles.platformIcon}>
                  <WhatsAppIcon />
                </div>
                <span className={styles.platformLabel}>WhatsApp</span>
              </button>

              <button
                className={styles.platformBtn}
                onClick={() => handleShare('tiktok')}
                disabled={isSharing}
                type="button"
              >
                <div className={styles.platformIcon}>
                  <TikTokIcon />
                </div>
                <span className={styles.platformLabel}>TikTok</span>
              </button>

              <button
                className={styles.platformBtn}
                onClick={() => handleShare('system')}
                disabled={isSharing}
                type="button"
              >
                <div className={styles.platformIcon}>
                  <ShareIcon />
                </div>
                <span className={styles.platformLabel}>More</span>
              </button>
            </div>

            {/* Loading Overlay */}
            {isSharing && (
              <div className={styles.loadingOverlay}>
                <div className={styles.loadingSpinner} />
                <span>Preparing your story...</span>
              </div>
            )}
          </motion.div>

          {/* Hidden Canvas for Full Resolution Export */}
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
