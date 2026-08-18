import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import {
  useProfileFields,
  isRequiredField,
  GYM_MAX_LENGTH,
  LOCATION_MAX_LENGTH,
  NAME_MAX_LENGTH,
  SEX_OPTIONS,
} from '../../hooks/useProfileFields';
import type { ProfileFieldKey } from '../../hooks/useProfileFields';
import { useProfilePhoto } from '../../hooks/useProfilePhoto';
import { INSTAGRAM_MAX_LENGTH, instagramUrl, normalizeInstagram } from '../../utils/instagram';
import styles from './ProfileSettingsScreen.module.css';

interface ProfileSettingsScreenProps {
  onBack: () => void;
  onOpenSettings: () => void;
}

/**
 * The athlete's profile.
 *
 * A list of values, not a form: no boxed inputs, no Save button, each row a
 * label and its value with the value editable in place. The two cards are the
 * whole idea — the first is what other athletes see on your posters, the second
 * never leaves the app. That split is why they are separate cards rather than
 * one long list with a heading, and why the second one says so out loud.
 */
export function ProfileSettingsScreen({
  onBack,
  onOpenSettings,
}: ProfileSettingsScreenProps): React.JSX.Element {
  const { user } = useAuth();
  const { fields, setField, commit, savedKey, errors, saving } = useProfileFields();
  const photo = useProfilePhoto();

  // Built from what would be stored, not from what is typed, so a pasted URL or
  // an "@name" still opens the right profile before the field has been left.
  const handle = normalizeInstagram(fields.instagram);
  const handleUrl = handle ? instagramUrl(handle) : null;

  const rowClass = (key: ProfileFieldKey): string => {
    if (errors[key]) return `${styles.row} ${styles.rowInvalid}`;
    return savedKey === key ? `${styles.row} ${styles.rowSaved}` : styles.row;
  };

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
    >
      <header className={styles.header}>
        <button type="button" className={styles.circleButton} onClick={onBack} aria-label="Back">
          <ChevronLeftIcon />
        </button>
        <h1 className={styles.title}>Profile</h1>
        <button
          type="button"
          className={styles.circleButton}
          onClick={onOpenSettings}
          aria-label="Settings"
        >
          <CogIcon />
        </button>
      </header>

      <div className={styles.content}>
        <div className={styles.avatarBlock}>
          <button
            type="button"
            className={styles.avatarWrap}
            onClick={photo.pick}
            aria-label="Change profile photo"
          >
            {photo.src ? (
              <img src={photo.src} alt="" className={styles.avatar} />
            ) : (
              <span className={styles.avatarFallback}>
                {user?.displayName?.[0]?.toUpperCase() || 'W'}
              </span>
            )}
            <span className={styles.avatarBadge}>
              {photo.uploading ? <span className={styles.spinner} /> : <CameraIcon />}
            </span>
          </button>
          <input
            ref={photo.inputRef}
            type="file"
            accept="image/*"
            className={styles.hiddenInput}
            onChange={photo.onFileChange}
          />
          {photo.error && <span className={styles.error}>{photo.error}</span>}
        </div>

        {/* Public — copied onto every poster you post to the feed. */}
        <h2 className={styles.sectionTitle}>On your posters</h2>
        <section className={styles.card}>
          <label className={rowClass('displayName')}>
            <span className={styles.label}>Name<RequiredDot field="displayName" /></span>
            <input
              className={styles.value}
              value={fields.displayName}
              onChange={(e) => setField('displayName', e.target.value)}
              onBlur={() => commit('displayName')}
              placeholder="Your name"
              autoComplete="name"
              maxLength={NAME_MAX_LENGTH}
              required
              aria-invalid={Boolean(errors.displayName)}
              aria-describedby={errors.displayName ? 'profile-error-displayName' : undefined}
            />
          </label>
          <FieldNote id="profile-error-displayName" message={errors.displayName} />

          <label className={rowClass('gym')}>
            <span className={styles.label}>Box / Gym<RequiredDot field="gym" /></span>
            <input
              className={styles.value}
              value={fields.gym}
              onChange={(e) => setField('gym', e.target.value)}
              onBlur={() => commit('gym')}
              placeholder="Add your box"
              maxLength={GYM_MAX_LENGTH}
              autoCapitalize="words"
              aria-invalid={Boolean(errors.gym)}
              aria-describedby={errors.gym ? 'profile-error-gym' : undefined}
            />
          </label>
          <FieldNote id="profile-error-gym" message={errors.gym} />

          <label className={rowClass('location')}>
            <span className={styles.label}>City<RequiredDot field="location" /></span>
            <input
              className={styles.value}
              value={fields.location}
              onChange={(e) => setField('location', e.target.value)}
              onBlur={() => commit('location')}
              placeholder="City, country"
              maxLength={LOCATION_MAX_LENGTH}
              autoCapitalize="words"
              aria-invalid={Boolean(errors.location)}
              aria-describedby={errors.location ? 'profile-error-location' : undefined}
            />
          </label>
          <FieldNote id="profile-error-location" message={errors.location} />

          {/* The handle is stored bare, so the "@" is furniture: it renders beside
              the field rather than in it. The field is sized to its own text — see
              the size={1} note — so the pair stays flush and lands hard right with
              every other value on the screen.

              Not a <label> like the other rows either: its left half is the way
              out to the actual Instagram profile once there is one, so the row
              only hands focus to the field when there is nowhere to go. */}
          <div className={rowClass('instagram')}>
            {handleUrl ? (
              <a
                className={`${styles.label} ${styles.labelIcon} ${styles.labelLink}`}
                href={handleUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <InstagramIcon />
                Instagram
                <RequiredDot field="instagram" />
              </a>
            ) : (
              <label className={`${styles.label} ${styles.labelIcon}`} htmlFor="profile-instagram">
                <InstagramIcon />
                Instagram
                <RequiredDot field="instagram" />
              </label>
            )}
            <span className={styles.handle}>
              <span className={styles.prefix} aria-hidden="true">@</span>
              <span className={styles.autoWidth} data-value={fields.instagram || 'yourname'}>
                <input
                  id="profile-instagram"
                  className={`${styles.value} ${styles.handleInput}`}
                  value={fields.instagram}
                  onChange={(e) => setField('instagram', e.target.value)}
                  onBlur={() => commit('instagram')}
                  placeholder="yourname"
                  maxLength={INSTAGRAM_MAX_LENGTH + 20}
                  /* Its own intrinsic width would otherwise set the grid column
                     (~20 characters) and strand the "@" mid-row. */
                  size={1}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-invalid={Boolean(errors.instagram)}
                  aria-describedby={errors.instagram ? 'profile-error-instagram' : undefined}
                />
              </span>
            </span>
          </div>
          <FieldNote id="profile-error-instagram" message={errors.instagram} />
        </section>
        <p className={styles.sectionNote}>
          <span className={styles.requiredDot} aria-hidden="true" /> Required — everything
          else is optional.
        </p>

        {/* Private — drives calculations, never shown to anyone else. */}
        <h2 className={styles.sectionTitle}>Private</h2>
        <section className={styles.card}>
          <label className={rowClass('birthYear')}>
            <span className={styles.label}>Born<RequiredDot field="birthYear" /></span>
            <input
              className={styles.value}
              value={fields.birthYear}
              onChange={(e) => setField('birthYear', e.target.value)}
              onBlur={() => commit('birthYear')}
              placeholder="YYYY"
              inputMode="numeric"
              maxLength={4}
              aria-invalid={Boolean(errors.birthYear)}
              aria-describedby={errors.birthYear ? 'profile-error-birthYear' : undefined}
            />
          </label>
          <FieldNote id="profile-error-birthYear" message={errors.birthYear} />

          <label className={rowClass('weight')}>
            <span className={styles.label}>Weight<RequiredDot field="weight" /></span>
            <input
              className={styles.value}
              value={fields.weight}
              onChange={(e) => setField('weight', e.target.value)}
              onBlur={() => commit('weight')}
              placeholder="—"
              inputMode="decimal"
              maxLength={5}
              required
              aria-invalid={Boolean(errors.weight)}
              aria-describedby={errors.weight ? 'profile-error-weight' : undefined}
            />
            <span className={styles.unit}>kg</span>
          </label>
          <FieldNote id="profile-error-weight" message={errors.weight} />

          {/* Kept although the design omits it: this drives the Rx weight and
              calorie prefill when logging, so losing it costs every future log. */}
          <div className={rowClass('sex')}>
            <span className={styles.label}>Sex<RequiredDot field="sex" /></span>
            <div className={styles.choices} role="group" aria-label="Sex">
              {SEX_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`${styles.choice} ${fields.sex === option.value ? styles.choiceOn : ''}`}
                  onClick={() => { setField('sex', option.value); commit('sex'); }}
                  aria-pressed={fields.sex === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </section>
        <p className={styles.sectionNote}>
          Your weight and birth year are never shown on a poster, in the feed, or to
          anyone else. They only set your EP and your Rx prefills when you log.
        </p>

        <p className={styles.hint}>{saving ? 'Saving…' : 'Changes save when you leave a field'}</p>
      </div>
    </motion.div>
  );
}

/**
 * The mark that says a row cannot be left blank — rendered on every row and
 * shown on the ones the hook calls required, so the screen never keeps its own
 * list of what matters.
 */
function RequiredDot({ field }: { field: ProfileFieldKey }): React.JSX.Element | null {
  if (!isRequiredField(field)) return null;
  return <span className={styles.requiredDot} aria-hidden="true" />;
}

/** What is wrong with the row above it. Renders nothing while the row is fine. */
function FieldNote({ id, message }: { id: string; message?: string }): React.JSX.Element | null {
  if (!message) return null;
  return (
    <p className={styles.fieldNote} id={id} role="alert">
      {message}
    </p>
  );
}

function ChevronLeftIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function CogIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </svg>
  );
}

function CameraIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l1.4-2.2A2 2 0 0 1 10 5h4a2 2 0 0 1 1.7.8L17 8h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z" />
      <circle cx="12" cy="13.5" r="3.4" />
    </svg>
  );
}

function InstagramIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
