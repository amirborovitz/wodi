import { useState } from 'react';
import type { FocusEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { INSTAGRAM_MAX_LENGTH, normalizeInstagram } from '../utils/instagram';
import styles from './OnboardingScreen.module.css';

interface OnboardingScreenProps {
  onComplete: () => void;
}

const STEPS = [1, 2, 3, 4] as const;
type Step = (typeof STEPS)[number];
const LAST_STEP: Step = 4;

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const { user, updateUserProfile } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState(user?.displayName || '');
  const [birthYear, setBirthYear] = useState<string>('');
  const [weight, setWeight] = useState<string>('');
  const [gym, setGym] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [instagram, setInstagram] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Select all text on focus for easy overwriting
  const handleSelectOnFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.currentTarget.select();
  };

  const handleContinue = () => {
    if (step < LAST_STEP) {
      setStep((step + 1) as Step);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((step - 1) as Step);
    }
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      const profile: {
        displayName: string;
        birthYear?: number;
        weight?: number;
        gym?: string;
        location?: string;
        instagram?: string;
        onboardingComplete: boolean;
      } = {
        displayName: name.trim() || 'Athlete',
        onboardingComplete: true,
      };

      if (birthYear) {
        const yearNum = parseInt(birthYear, 10);
        if (!isNaN(yearNum) && yearNum >= 1900 && yearNum <= new Date().getFullYear()) {
          profile.birthYear = yearNum;
        }
      }

      if (weight) {
        const weightNum = parseFloat(weight);
        if (!isNaN(weightNum) && weightNum > 0 && weightNum < 500) {
          profile.weight = weightNum;
        }
      }

      // Skipped fields stay off the doc entirely rather than being written as "".
      if (gym.trim()) profile.gym = gym.trim();
      if (location.trim()) profile.location = location.trim();
      const igHandle = normalizeInstagram(instagram);
      if (igHandle) profile.instagram = igHandle;

      await updateUserProfile(profile);
      onComplete();
    } catch (error) {
      console.error('Error completing onboarding:', error);
    } finally {
      setSaving(false);
    }
  };

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 100 : -100,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 100 : -100,
      opacity: 0,
    }),
  };

  const renderStep1 = () => (
    <motion.div
      key="step1"
      custom={1}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={styles.stepContent}
    >
      <h1 className={styles.title}>What should we call you?</h1>
      <p className={styles.subtitle}>This is how you'll appear in the app</p>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className={styles.input}
        autoFocus
      />

      <button
        className={styles.primaryButton}
        onClick={handleContinue}
        disabled={!name.trim()}
      >
        Continue
      </button>
    </motion.div>
  );

  const renderStep2 = () => (
    <motion.div
      key="step2"
      custom={1}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={styles.stepContent}
    >
      <h1 className={styles.title}>Cool, {name.split(' ')[0]}!</h1>
      <p className={styles.subtitle}>Let's get to know you a bit better</p>

      <div className={styles.fieldGroup}>
        <label className={styles.label}>What year were you born?</label>
        <div className={styles.inputRow}>
          <input
            type="number"
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            onFocus={handleSelectOnFocus}
            placeholder="e.g. 1990"
            className={styles.input}
            min={1900}
            max={new Date().getFullYear()}
          />
        </div>
        <span className={styles.hint}>Optional - helps personalize your experience</span>
      </div>

      <div className={styles.buttonRow}>
        <button className={styles.secondaryButton} onClick={handleBack}>
          Back
        </button>
        <button className={styles.primaryButton} onClick={handleContinue}>
          {birthYear ? 'Continue' : 'Skip'}
        </button>
      </div>
    </motion.div>
  );

  const renderStep3 = () => (
    <motion.div
      key="step3"
      custom={1}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={styles.stepContent}
    >
      <h1 className={styles.title}>Almost there!</h1>
      <p className={styles.subtitle}>What's your current weight?</p>

      <div className={styles.fieldGroup}>
        <div className={styles.inputRow}>
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onFocus={handleSelectOnFocus}
            placeholder="Weight"
            className={styles.input}
            min={1}
            max={500}
            step={0.1}
          />
          <span className={styles.unit}>kg</span>
        </div>
        <span className={styles.hint}>Optional - used for calorie calculations</span>
      </div>

      <div className={styles.buttonRow}>
        <button className={styles.secondaryButton} onClick={handleBack}>
          Back
        </button>
        <button className={styles.primaryButton} onClick={handleContinue}>
          {weight ? 'Continue' : 'Skip'}
        </button>
      </div>
    </motion.div>
  );

  // The community profile — everything another athlete sees next to your poster
  // on the feed. Last on purpose: onboarding closes on who you train with rather
  // than on a body-weight field, and nothing here blocks finishing.
  const renderStep4 = () => (
    <motion.div
      key="step4"
      custom={1}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`${styles.stepContent} ${styles.stepContentForm}`}
    >
      <h1 className={styles.title}>Where do you train?</h1>
      <p className={styles.subtitle}>All optional — this is what the Wodi feed shows next to your posters</p>

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="onboarding-gym">Box / Gym</label>
        <input
          id="onboarding-gym"
          type="text"
          value={gym}
          onChange={(e) => setGym(e.target.value)}
          placeholder="CrossFit Ironclad"
          className={`${styles.input} ${styles.inputLeft}`}
          maxLength={40}
          autoCapitalize="words"
        />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="onboarding-location">City / Country</label>
        <input
          id="onboarding-location"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Tel Aviv, Israel"
          className={`${styles.input} ${styles.inputLeft}`}
          maxLength={60}
          autoCapitalize="words"
        />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="onboarding-instagram">Instagram</label>
        <div className={styles.prefixedInput}>
          <span className={styles.prefix}>@</span>
          <input
            id="onboarding-instagram"
            type="text"
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            placeholder="yourname"
            className={`${styles.input} ${styles.inputLeft} ${styles.inputPrefixed}`}
            maxLength={INSTAGRAM_MAX_LENGTH + 20}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <span className={styles.hintLeft}>Athletes can tap through to your profile</span>
      </div>

      <div className={styles.buttonRow}>
        <button className={styles.secondaryButton} onClick={handleBack}>
          Back
        </button>
        <button
          className={styles.primaryButton}
          onClick={handleFinish}
          disabled={saving}
        >
          {saving ? 'Saving...' : "Let's Go!"}
        </button>
      </div>
    </motion.div>
  );

  return (
    <div className={styles.container}>
      <div className={styles.progressDots}>
        {STEPS.map((dotStep) => (
          <div
            key={dotStep}
            className={`${styles.dot} ${step >= dotStep ? styles.dotActive : ''}`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait" custom={step}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </AnimatePresence>
    </div>
  );
}
