import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useWorkouts } from '../hooks/useWorkouts';
import { usePRCount } from '../hooks/usePRCount';
import { useRecapData } from '../hooks/useRecapData';
import { useProfileCompleteness } from '../hooks/useProfileCompleteness';
import { useHomeScreenInstall } from '../hooks/useHomeScreenInstall';
import { useWorkoutExport } from '../hooks/useWorkoutExport';
import { MeWrappedHub } from '../components/recap/MeWrappedHub';
import { AddToHomeScreenSheet } from '../components/ui/AddToHomeScreenSheet';
import { ActionMenuSheet } from '../components/ui/ActionMenuSheet';
import { Toast, useToast } from '../components/ui/Toast';
import { DEFAULT_BW } from '../utils/xpCalculations';
import { aggregateStats } from '../utils/statsAggregation';
import { computeWeekStreak } from '../utils/weekStreak';
import type { RecapData } from '../hooks/useRecapData';
import styles from './ProfileScreen.module.css';

interface ProfileScreenProps {
  onNavigateToRecords?: () => void;
  onNavigateToSettings?: () => void;
  onNavigateToProfile?: () => void;
  onOpenRecap?: (data: RecapData) => void;
}

export function ProfileScreen({ onNavigateToRecords, onNavigateToSettings, onNavigateToProfile, onOpenRecap }: ProfileScreenProps) {
  const { user } = useAuth();
  const { workouts } = useWorkouts(Number.MAX_SAFE_INTEGER);
  const { prCount } = usePRCount();
  const { recaps, newRecapIds } = useRecapData(workouts, user?.id, user?.weight);
  const profile = useProfileCompleteness();
  const homeScreenInstall = useHomeScreenInstall(workouts.length > 0);
  const workoutExport = useWorkoutExport(workouts);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const toast = useToast();

  const totalWorkouts = workouts.length;
  const totalEP = useMemo(
    () => aggregateStats(workouts, { bodyweight: user?.weight ?? DEFAULT_BW }).totalEP,
    [workouts, user?.weight]
  );
  // Lifetime, never period-scoped: a streak counts back from today by
  // definition, so the Week/Month toggle has nothing to say about it.
  const weekStreak = useMemo(() => computeWeekStreak(workouts), [workouts]);

  return (
    <div className={styles.container}>
      {/* Compact Left-Aligned Header */}
      <motion.div
        className={styles.header}
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        {/* The whole header is the way into Profile — avatar, name and pencil
            all lead to the same place, so there is no dead target up here. */}
        <button
          type="button"
          className={styles.identity}
          onClick={onNavigateToProfile}
          aria-label="Edit your profile"
        >
          <span className={styles.avatarWrap}>
            {user?.photoUrl ? (
              <img
                src={`${user.photoUrl}?v=${user.photoUpdatedAt ?? 0}`}
                alt=""
                className={styles.avatar}
              />
            ) : (
              <span className={styles.avatarFallback}>{user?.displayName?.[0]?.toUpperCase() || 'W'}</span>
            )}
          </span>

          <span className={styles.nameArea}>
            <span className={styles.name}>{user?.displayName}</span>
            {/* One line under the name, and the nudge outranks the handle for it:
                the handle is decoration that will still be there tomorrow, while
                this goes away for good the first time the athlete fills anything
                in. It cannot collide with the handle in practice either — an
                Instagram handle is itself a detail, so having one turns it off. */}
            {profile.prompt ? (
              <span className={styles.profilePrompt}>{profile.prompt} &rarr;</span>
            ) : (
              user?.instagram && <span className={styles.handle}>@{user.instagram}</span>
            )}
          </span>

          <span className={styles.editButton}><EditIcon /></span>
        </button>

        <button
          type="button"
          className={styles.headerSettings}
          onClick={onNavigateToSettings}
          aria-label="Settings"
        >
          <SettingsIcon />
        </button>
      </motion.div>

      {/* Lifetime stats strip */}
      <motion.div
        className={styles.lifetimeStrip}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.28 }}
      >
        {/* Three, and each says something the others don't. "Posters" was
            workouts.length under a second name, and the PR count is the
            subtitle of the Records row immediately below — a strip that
            reprints what is already on screen costs the space and pays
            nothing. */}
        {[
          ['Workouts', totalWorkouts],
          ['Week Streak', weekStreak],
          ['Total EP', totalEP],
        ].map(([label, value]) => (
          <div key={label} className={styles.lifetimeStat}>
            <span className={styles.lifetimeValue}>{Math.round(Number(value)).toLocaleString()}</span>
            <span className={styles.lifetimeLabel}>{label}</span>
          </div>
        ))}
      </motion.div>

      {/* Navigation rows */}
      <div className={styles.navRows}>
        <button
          className={`${styles.navRow} ${styles.navRowAccent}`}
          onClick={onNavigateToRecords}
          aria-label="View records and PRs"
        >
          <span className={`${styles.navRowIcon} ${styles.navRowIconAccent}`}>★</span>
          <div className={styles.navRowText}>
            <span className={styles.navRowLabel}>Records & PRs</span>
            <span className={styles.navRowSub}>{prCount} personal records</span>
          </div>
          <span className={styles.navRowChevron}>›</span>
        </button>

        {/* The athlete's whole log, theirs to take elsewhere. It lives here rather than on
            Today because it needs a name and a sentence to be understood at all — and
            because it is a thing you do once in a while, not a thing you do after training. */}
        {workoutExport.available && (
          <button
            type="button"
            className={styles.navRow}
            onClick={() => setExportMenuOpen(true)}
          >
            <span className={styles.navRowIcon}>↗</span>
            <div className={styles.navRowText}>
              <span className={styles.navRowLabel}>Take your log to an AI</span>
              <span className={styles.navRowSub}>
                {totalWorkouts} workouts — copy them for ChatGPT, Claude or Gemini
              </span>
            </div>
            <span className={styles.navRowChevron}>›</span>
          </button>
        )}

        {/* The permanent way back to the home-screen steps, for anyone who waved the Today
            card away. Gone for good once wodi has been opened from the icon. */}
        {homeScreenInstall.available && (
          <button
            type="button"
            className={styles.navRow}
            onClick={homeScreenInstall.openSheet}
          >
            <img src="/wodi-icon-180.png" alt="" className={styles.navRowAppIcon} />
            <div className={styles.navRowText}>
              <span className={styles.navRowLabel}>Add to home screen</span>
              <span className={styles.navRowSub}>Open wodi like an app</span>
            </div>
            <span className={styles.navRowChevron}>›</span>
          </button>
        )}
      </div>

      {/* Both routes are local: one fills the clipboard, one writes a file. Nothing is
          uploaded, so the athlete decides where their log actually goes. */}
      <ActionMenuSheet
        title={exportMenuOpen ? 'Your whole log' : null}
        onClose={() => setExportMenuOpen(false)}
        items={[
          {
            label: 'Copy it for my AI',
            onClick: () => {
              void workoutExport.copyForAgent().then((result) => {
                toast.say(result === 'copied'
                  ? `Copied — ${totalWorkouts} workouts, ready to paste`
                  : 'Clipboard blocked — saved as a file instead');
              });
            },
          },
          // A saved file on a phone lands in Files and is never seen again.
          ...(workoutExport.canDownload ? [{
            label: 'Download as a file',
            onClick: () => {
              const result = workoutExport.downloadJson();
              toast.say(result === 'downloaded' ? 'Saved to your downloads' : 'Could not save the file');
            },
          }] : []),
        ]}
      />

      <Toast message={toast.message} />

      <AddToHomeScreenSheet
        open={homeScreenInstall.sheetOpen}
        shareLocation={homeScreenInstall.shareLocation}
        onClose={homeScreenInstall.closeSheet}
      />

      {/* Your Wrapped \u2014 the only period-scoped thing on Me.
          The Week/Month/All-Time toggle and its three tiles are gone: Wrapped
          already tells that data with a personality, and wodi is not a tracker.
          The lifetime numbers that were worth keeping live in the strip above. */}
      <MeWrappedHub
        items={recaps}
        newIds={newRecapIds}
        onOpen={(data) => onOpenRecap?.(data)}
      />
    </div>
  );
}

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
