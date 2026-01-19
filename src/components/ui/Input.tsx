import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import styles from './Input.module.css';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftElement, rightElement, className = '', ...props }, ref) => {
    return (
      <div className={`${styles.container} ${className}`}>
        {label && (
          <label className={styles.label}>{label}</label>
        )}
        <div className={`${styles.inputWrapper} ${error ? styles.hasError : ''}`}>
          {leftElement && (
            <span className={styles.leftElement}>{leftElement}</span>
          )}
          <input
            ref={ref}
            className={`${styles.input} ${leftElement ? styles.hasLeft : ''} ${rightElement ? styles.hasRight : ''}`}
            {...props}
          />
          {rightElement && (
            <span className={styles.rightElement}>{rightElement}</span>
          )}
        </div>
        {(error || hint) && (
          <span className={`${styles.hint} ${error ? styles.errorText : ''}`}>
            {error || hint}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
