import type React from 'react';

/** The board camera — the shape the docked composer's yellow camera uses. */
export function CameraIcon({ size }: { size: number }): React.ReactElement {
  return (
    <svg width={size} height={size * 0.88} viewBox="0 0 24 21" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 6h4.5l2-3h7l2 3H22v13H2z" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}
