import { useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { useAuth } from '../context/AuthContext';
import { track } from '../services/analytics';

const CODE_LENGTH = 6;

/** closed = the provider buttons; email = asking for the address; code = waiting for the 6 digits. */
export type EmailSignInStep = 'closed' | 'email' | 'code';

export interface EmailCodeSignIn {
  step: EmailSignInStep;
  email: string;
  code: string;
  busy: 'sending' | 'verifying' | null;
  error: string | null;
  /** A code just went out — shown under the code field so they know where to look. */
  notice: string | null;
  open: () => void;
  close: () => void;
  setEmail: (email: string) => void;
  /** Keeps digits only; the sixth digit signs in on its own. */
  setCode: (code: string) => void;
  sendCode: () => Promise<void>;
  verifyCode: () => Promise<void>;
  changeEmail: () => void;
}

function describeError(error: unknown): string {
  const code = error instanceof FirebaseError ? error.code : undefined;
  switch (code) {
    case 'functions/invalid-argument':
      return error instanceof FirebaseError && error.message === 'invalid-code'
        ? 'Enter the 6-digit code from the email.'
        : "That email address doesn't look right.";
    case 'functions/resource-exhausted':
      return 'A code is already on its way. Give it 30 seconds before asking for another.';
    case 'functions/unavailable':
      return "We couldn't send the email. Try again in a minute.";
    case 'functions/permission-denied':
      return "That code isn't right. Check the email and try again.";
    case 'functions/failed-precondition':
      return 'That code has expired. Send a new one.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export function useEmailCodeSignIn(): EmailCodeSignIn {
  const { sendEmailCode, signInWithEmailCode } = useAuth();
  const [step, setStep] = useState<EmailSignInStep>('closed');
  const [email, setEmail] = useState('');
  const [code, setCodeState] = useState('');
  const [busy, setBusy] = useState<'sending' | 'verifying' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const open = (): void => {
    track('sign_in_tapped', { method: 'email' });
    setError(null);
    setStep('email');
  };

  const close = (): void => {
    setError(null);
    setNotice(null);
    setCodeState('');
    setStep('closed');
  };

  const sendCode = async (): Promise<void> => {
    const address = email.trim();
    if (!address || busy) return;
    setBusy('sending');
    setError(null);
    try {
      await sendEmailCode(address);
      setCodeState('');
      setNotice(`We sent a code to ${address}. Check spam if it's not there.`);
      setStep('code');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  };

  const verify = async (digits: string): Promise<void> => {
    if (digits.length !== CODE_LENGTH || busy) return;
    setBusy('verifying');
    setError(null);
    try {
      // On success the auth listener swaps this screen out; nothing more to do here.
      await signInWithEmailCode(email.trim(), digits);
    } catch (err) {
      setError(describeError(err));
      setCodeState('');
    } finally {
      setBusy(null);
    }
  };

  const setCode = (raw: string): void => {
    const digits = raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCodeState(digits);
    if (digits.length === CODE_LENGTH) void verify(digits);
  };

  const changeEmail = (): void => {
    setError(null);
    setNotice(null);
    setCodeState('');
    setStep('email');
  };

  return {
    step,
    email,
    code,
    busy,
    error,
    notice,
    open,
    close,
    setEmail,
    setCode,
    sendCode,
    verifyCode: () => verify(code),
    changeEmail,
  };
}
