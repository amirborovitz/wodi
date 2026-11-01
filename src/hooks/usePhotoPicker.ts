import { useCallback, useRef } from 'react';
import type React from 'react';

export interface PhotoPicker {
  /** Goes on a hidden `<input type="file" accept="image/*">`. */
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Opens the phone's picker — camera, photos or files, the phone's own choice. */
  open: () => void;
}

/** One board photo from the phone, handed on once picked. The input is cleared so the same photo can be sent twice. */
export function usePhotoPicker(onPhoto: (file: File) => void): PhotoPicker {
  const inputRef = useRef<HTMLInputElement>(null);
  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onPhoto(file);
  }, [onPhoto]);
  const open = useCallback((): void => { inputRef.current?.click(); }, []);
  return { inputRef, onChange, open };
}
