import { useState } from 'react';
import type { FocusEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import styles from './OnboardingScreen.module.css';

interface OnboardingScreenProps {
  onComplete: () => void;
}

type Step = 1 | 2 | 3;

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const { user, updateUserProfile } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState(user?.displayName || '');
  const [age, setAge] = useState<string>('');
  const [weight, setWeight] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Select all text on focus for easy overwriting
  const handleSelectOnFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.currentTarget.select();
  };

  const handleContinue = () => {
    if (step < 3) {
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
        age?: number;
        weight?: number;
        onboardingComplete: boolean;
      } = {
        displayName: name.trim() || 'Athlete',
        onboardingComplete: true,
      };

      if (age) {
        const ageNum = parseInt(age, 10);
        if (!isNaN(ageNum) && ageNum > 0 && ageNum < 120) {
          profile.age = ageNum;
        }
      }

      if (weight) {
        const weightNum = parseFloat(weight);
        if (!isNaN(weightNum) && weightNum > 0 && weightNum < 500) {
          profile.weight = weightNum;
        }
      }

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
        <label className={styles.label}>How old are you?</label>
        <div className={styles.inputRow}>
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            onFocus={handleSelectOnFocus}
            placeholder="Age"
            className={styles.input}
            min={1}
            max={120}
          />
          <span className={styles.unit}>years</span>
        </div>
        <span className={styles.hint}>Optional - helps personalize your experience</span>
      </div>

      <div className={styles.buttonRow}>
        <button className={styles.secondaryButton} onClick={handleBack}>
          Back
        </button>
        <button className={styles.primaryButton} onClick={handleContinue}>
          {age ? 'Continue' : 'Skip'}
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
        {[1, 2, 3].map((dotStep) => (
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
      </AnimatePresence>
    </div>
  );
}
