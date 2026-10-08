import { useState } from 'react';
import type { FocusEvent } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { INSTAGRAM_MAX_LENGTH, normalizeInstagram } from '../utils/instagram';
import { track } from '../services/analytics';
import { toKg, type LoadUnit } from '../utils/loadUnits';
import styles from './OnboardingScreen.module.css';

interface OnboardingScreenProps {
  onComplete: () => void;
}

const STEPS = [1, 2, 3, 4] as const;
type Step = (typeof STEPS)[number];
const LAST_STEP: Step = 4;

// Wodi's hello — its four jobs in its own voice: cheers, posters, remembers, asks.
const HELLO_LINES = [
  "Hey! I'm Wodi 👋",
  'Your training buddy. I cheer every workout, turn it into a poster, and remember every PR.',
  'First up — what should I call you?',
] as const;

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const { user, updateUserProfile } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState(user?.displayName || '');
  const [birthYear, setBirthYear] = useState<string>('');
  const [weight, setWeight] = useState<string>('');
  const [weightUnit, setWeightUnit] = useState<LoadUnit | null>(null);
  const [gym, setGym] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [instagram, setInstagram] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [greeted, setGreeted] = useState(false);

  // Select all text on focus for easy overwriting
  const handleSelectOnFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.currentTarget.select();
  };

  const handleContinue = () => {
    if (step < LAST_STEP) {
      const next = (step + 1) as Step;
      track('onboarding_step', { step: next });
      setGreeted(true);
      setStep(next);
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
        weightUnit?: LoadUnit;
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

      // Skipped: Wodi asks "kg or lb?" the first time a board leaves a weight's unit unsaid.
      if (weightUnit) profile.weightUnit = weightUnit;

      // Typed in their unit, kept in kg — body weight only feeds the kg math (EP, calories).
      if (weight) {
        const weightKg = toKg(parseFloat(weight), weightUnit ?? 'kg');
        if (!isNaN(weightKg) && weightKg > 0 && weightKg < 500) {
          profile.weight = Math.round(weightKg * 10) / 10;
        }
      }

      // Skipped fields stay off the doc entirely rather than being written as "".
      if (gym.trim()) profile.gym = gym.trim();
      if (location.trim()) profile.location = location.trim();
      const igHandle = normalizeInstagram(instagram);
      if (igHandle) profile.instagram = igHandle;

      await updateUserProfile(profile);
      track('onboarding_complete', {});
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

  // Wodi says hello the way it talks everywhere else — chat bubbles, one at a
  // time — and the name field is your reply. Coming back from step 2 skips the
  // typing pause: you've already met.
  const helloDelay = (i: number): number => (greeted ? 0 : 0.5 + i * 0.75);
  const renderStep1 = () => (
    <motion.div
      key="step1"
      custom={1}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`${styles.stepContent} ${styles.stepHello}`}
    >
      <h1 className={styles.wordmark} aria-label="wodi">
        wodi
        {/* The dot is the brand — it hops every time you type a letter. */}
        <motion.span
          key={name.length}
          className={styles.wordmarkDot}
          animate={{ y: [0, -14, 0], scale: [1, 1.25, 1] }}
          transition={{ duration: 0.45, ease: 'easeOut', delay: greeted || name ? 0 : 0.2 }}
        >
          .
        </motion.span>
      </h1>

      <div className={styles.helloChat}>
        {HELLO_LINES.map((line, i) => (
          <motion.p
            key={line}
            className={styles.helloBubble}
            initial={{ opacity: 0, y: 12, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26, delay: helloDelay(i) }}
          >
            {line}
          </motion.p>
        ))}
      </div>

      <motion.div
        className={styles.helloReply}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: helloDelay(HELLO_LINES.length) }}
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          aria-label="Your name"
          className={styles.input}
          autoFocus
        />

        <button
          className={styles.primaryButton}
          onClick={handleContinue}
          disabled={!name.trim()}
        >
          {name.trim() ? `That's me, ${name.trim().split(' ')[0]}` : 'Continue'}
        </button>
      </motion.div>
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
      <p className={styles.subtitle}>Do you lift in kilos or pounds?</p>

      <div className={styles.unitChoice} role="radiogroup" aria-label="Weight unit">
        {(['kg', 'lb'] as const).map((unit) => (
          <button
            key={unit}
            type="button"
            role="radio"
            aria-checked={weightUnit === unit}
            className={weightUnit === unit ? styles.unitOptionActive : styles.unitOption}
            onClick={() => setWeightUnit(unit)}
          >
            {unit === 'kg' ? 'Kilos (kg)' : 'Pounds (lb)'}
          </button>
        ))}
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label}>Your body weight</label>
        <div className={styles.inputRow}>
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onFocus={handleSelectOnFocus}
            placeholder="Weight"
            className={styles.input}
            min={1}
            max={weightUnit === 'lb' ? 1100 : 500}
            step={0.1}
          />
          <span className={styles.unit}>{weightUnit ?? 'kg'}</span>
        </div>
        <span className={styles.hint}>Optional - used for calorie calculations</span>
      </div>

      <div className={styles.buttonRow}>
        <button className={styles.secondaryButton} onClick={handleBack}>
          Back
        </button>
        <button className={styles.primaryButton} onClick={handleContinue}>
          {weight || weightUnit ? 'Continue' : 'Skip'}
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
          placeholder="City, Country"
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
    <MotionConfig reducedMotion="user">
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
    </MotionConfig>
  );
}
