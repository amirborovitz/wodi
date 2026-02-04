import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import type { MovementTotal } from '../../types';
import styles from './MovementEditSheet.module.css';

interface MovementEditSheetProps {
  open: boolean;
  movement: MovementTotal | null;
  onClose: () => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
}

// Common movement name suggestions
const MOVEMENT_SUGGESTIONS = [
  'Run', 'Row', 'Bike', 'Ski Erg',
  'Thruster', 'Deadlift', 'Clean', 'Snatch',
  'Pull-up', 'Push-up', 'Burpee', 'Box Jump',
  'Wall Ball', 'Kettlebell Swing', 'Double Under',
  'Squat', 'Lunge', 'Press', 'Muscle-up',
];

export function MovementEditSheet({
  open,
  movement,
  onClose,
  onRename,
  onDelete,
}: MovementEditSheetProps) {
  const [editedName, setEditedName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Reset state when opening
  useEffect(() => {
    if (open && movement) {
      setEditedName(movement.name);
      setShowDeleteConfirm(false);
      // Focus input after animation
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open, movement]);

  const handleSave = () => {
    if (movement && editedName.trim() && editedName !== movement.name) {
      onRename(movement.name, editedName.trim());
    }
    onClose();
  };

  const handleDelete = () => {
    if (movement) {
      onDelete(movement.name);
      onClose();
    }
  };

  const handleSuggestionTap = (suggestion: string) => {
    setEditedName(suggestion);
    // Trigger haptic feedback if available
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
  };

  const handleDragEnd = (_: never, info: PanInfo) => {
    if (info.velocity.y > 500 || info.offset.y > 150) {
      onClose();
    }
  };

  // Filter suggestions based on current input
  const filteredSuggestions = MOVEMENT_SUGGESTIONS.filter(
    s => s.toLowerCase().includes(editedName.toLowerCase()) && s.toLowerCase() !== editedName.toLowerCase()
  ).slice(0, 6);

  return (
    <AnimatePresence>
      {open && movement && (
        <>
          {/* Backdrop */}
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            className={styles.sheet}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
          >
            {/* Drag Handle */}
            <div className={styles.dragHandle}>
              <div className={styles.handleBar} />
            </div>

            {/* Header */}
            <div className={styles.header}>
              <button className={styles.cancelButton} onClick={onClose}>
                Cancel
              </button>
              <h3 className={styles.title}>Edit Movement</h3>
              <button
                className={styles.saveButton}
                onClick={handleSave}
                disabled={!editedName.trim()}
              >
                Save
              </button>
            </div>

            {/* Content */}
            <div className={styles.content}>
              {/* Name Input */}
              <div className={styles.inputGroup}>
                <label className={styles.label}>Movement Name</label>
                <input
                  ref={inputRef}
                  type="text"
                  className={styles.input}
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  placeholder="Enter movement name"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>

              {/* Quick Suggestions */}
              {filteredSuggestions.length > 0 && (
                <div className={styles.suggestions}>
                  <span className={styles.suggestionsLabel}>Suggestions</span>
                  <div className={styles.suggestionChips}>
                    {filteredSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        className={styles.chip}
                        onClick={() => handleSuggestionTap(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Current Value Preview */}
              <div className={styles.preview}>
                <div className={styles.previewLabel}>Current Entry</div>
                <div className={styles.previewValue}>
                  {movement.totalReps && <span>{movement.totalReps} reps</span>}
                  {movement.totalDistance && <span>{movement.totalDistance}m</span>}
                  {movement.totalCalories && <span>{movement.totalCalories} cal</span>}
                  {movement.weight && <span>@ {movement.weight}kg</span>}
                </div>
              </div>

              {/* Delete Section */}
              <div className={styles.dangerZone}>
                {!showDeleteConfirm ? (
                  <button
                    className={styles.deleteButton}
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <DeleteIcon />
                    Remove Movement
                  </button>
                ) : (
                  <motion.div
                    className={styles.deleteConfirm}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <p>Remove "{movement.name}" from this workout?</p>
                    <div className={styles.confirmButtons}>
                      <button
                        className={styles.confirmCancel}
                        onClick={() => setShowDeleteConfirm(false)}
                      >
                        Keep
                      </button>
                      <button
                        className={styles.confirmDelete}
                        onClick={handleDelete}
                      >
                        Remove
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function DeleteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}
