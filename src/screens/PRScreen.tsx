import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { usePRs } from '../hooks/usePRs';
import { Button } from '../components/ui';
import { getMovementCategory } from '../data/exerciseDefinitions';
import type { MovementCategory } from '../data/exerciseDefinitions';
import type { PersonalRecord } from '../types';
import styles from './PRScreen.module.css';

interface PRScreenProps {
  onBack: () => void;
  onSelectWorkout?: (workoutId: string) => void;
}

// Standard CrossFit movements for autocomplete
const MOVEMENT_CATALOGUE = [
  'Back Squat', 'Front Squat', 'Overhead Squat',
  'Deadlift', 'Sumo Deadlift',
  'Clean', 'Power Clean', 'Squat Clean', 'Clean & Jerk',
  'Snatch', 'Power Snatch', 'Squat Snatch',
  'Bench Press', 'Strict Press', 'Push Press', 'Push Jerk', 'Split Jerk',
  'Thruster',
  'Pull-ups', 'Chest-to-Bar', 'Muscle-up', 'Bar Muscle-up',
  'Handstand Push-up',
  'Fran', 'Murph', 'Grace', 'Diane', 'Helen',
  'Isabel', 'Jackie', 'Karen', 'DT', 'Cindy',
  'Amanda', 'Annie', 'Nancy', 'Elizabeth',
];

type AddUnit = 'kg' | 'lb' | 'min' | 'reps';

// --- Icons ---

const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const TrophyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 22h16" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SearchIcon = () => (
  <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LinkIcon = () => (
  <svg className={styles.linkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CheckIcon = () => (
  <svg className={styles.selectedCheck} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// --- Helpers ---

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function heroColorClass(category: MovementCategory): string {
  switch (category) {
    case 'weightlifting':
    case 'gymnastics':
      return styles.heroNumberWeightlifting;
    case 'monostructural':
    case 'benchmark':
      return styles.heroNumberMonostructural;
  }
}

// --- Component ---

export function PRScreen({ onBack }: PRScreenProps) {
  const { user } = useAuth();
  const { prs, loading, error, refresh } = usePRs();

  // Add/Edit modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPR, setEditingPR] = useState<PersonalRecord | null>(null); // non-null = edit mode
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMovement, setSelectedMovement] = useState<string | null>(null);
  const [addValue, setAddValue] = useState('');
  const [addUnit, setAddUnit] = useState<AddUnit>('kg');
  const [saving, setSaving] = useState(false);

  // Action sheet state
  const [actionPR, setActionPR] = useState<PersonalRecord | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const valueInputRef = useRef<HTMLInputElement>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Best per movement, sorted by weight desc
  const uniquePRs = useMemo(() => {
    const best: Record<string, PersonalRecord> = {};
    for (const pr of prs) {
      if (!best[pr.movement] || pr.weight > best[pr.movement].weight) {
        best[pr.movement] = pr;
      }
    }
    return Object.values(best).sort((a, b) => b.weight - a.weight);
  }, [prs]);

  // Build unified suggestion list: user's existing PR movements + catalogue
  const allMovements = useMemo(() => {
    const existing = uniquePRs.map(p => p.movement);
    const merged = [...existing];
    for (const m of MOVEMENT_CATALOGUE) {
      if (!merged.some(e => e.toLowerCase() === m.toLowerCase())) {
        merged.push(m);
      }
    }
    return merged;
  }, [uniquePRs]);

  // Filter suggestions based on search query
  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return allMovements;
    const q = searchQuery.toLowerCase();
    return allMovements.filter(m => m.toLowerCase().includes(q));
  }, [searchQuery, allMovements]);

  // Focus value input when movement is selected
  useEffect(() => {
    if (selectedMovement) {
      setTimeout(() => valueInputRef.current?.focus(), 100);
    }
  }, [selectedMovement]);

  // Clear delete confirm timer on unmount
  useEffect(() => {
    return () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    };
  }, []);

  // --- Action Sheet ---

  const openActionSheet = (pr: PersonalRecord) => {
    setActionPR(pr);
    setDeleteConfirming(false);
  };

  const closeActionSheet = useCallback(() => {
    setActionPR(null);
    setDeleteConfirming(false);
    if (deleteTimerRef.current) {
      clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
  }, []);

  const handleDeleteTap = async () => {
    if (!deleteConfirming) {
      // First tap — arm confirmation
      setDeleteConfirming(true);
      // Auto-reset after 3 seconds
      deleteTimerRef.current = setTimeout(() => {
        setDeleteConfirming(false);
      }, 3000);
      return;
    }

    // Second tap — execute delete
    if (!actionPR || !user) return;
    setSaving(true);
    try {
      const prDocId = `${user.id}_${actionPR.movement.toLowerCase().replace(/\s+/g, '_')}`;
      await deleteDoc(doc(db, 'personalRecords', prDocId));
      await refresh();
      closeActionSheet();
    } catch (err) {
      console.error('Error deleting PR:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleEditTap = () => {
    if (!actionPR) return;
    // Capture the PR being edited, then open the form modal pre-populated
    setEditingPR(actionPR);
    setSelectedMovement(actionPR.movement);
    setAddValue(String(actionPR.weight));
    setAddUnit('kg');
    setSearchQuery('');
    setShowAddModal(true);
    closeActionSheet();
  };

  // --- Add/Edit Modal ---

  const openAddModal = () => {
    setEditingPR(null);
    setSearchQuery('');
    setSelectedMovement(null);
    setAddValue('');
    setAddUnit('kg');
    setShowAddModal(true);
    setTimeout(() => searchInputRef.current?.focus(), 300);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setEditingPR(null);
  };

  const selectMovement = (name: string) => {
    setSelectedMovement(name);
    setSearchQuery('');
  };

  const clearSelection = () => {
    // Don't allow changing movement when editing
    if (editingPR) return;
    setSelectedMovement(null);
    setAddValue('');
    setAddUnit('kg');
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const canSave = selectedMovement && addValue && parseFloat(addValue) > 0;

  const handleSave = async () => {
    if (!user || !selectedMovement || !addValue) return;
    const numVal = parseFloat(addValue);
    if (!numVal || numVal <= 0) return;

    // Convert to storage value (always kg for weight)
    let storedWeight = numVal;
    if (addUnit === 'lb') {
      storedWeight = numVal * 0.453592;
    }
    storedWeight = Math.round(storedWeight * 100) / 100;

    setSaving(true);
    try {
      const prDocId = `${user.id}_${selectedMovement.toLowerCase().replace(/\s+/g, '_')}`;
      await setDoc(doc(db, 'personalRecords', prDocId), {
        userId: user.id,
        movement: selectedMovement,
        weight: storedWeight,
        date: editingPR ? editingPR.date : new Date(),
        workoutId: editingPR?.workoutId || '',
      });
      await refresh();
      closeAddModal();
    } catch (err) {
      console.error('Error saving PR:', err);
    } finally {
      setSaving(false);
    }
  };

  const modalTitle = editingPR ? 'Edit Record' : 'Add Record';

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <Button variant="ghost" size="sm" onClick={onBack} icon={<BackIcon />} className={styles.backButton}>
          Back
        </Button>
        <h1 className={styles.headerTitle}>Records & PRs</h1>
        <button className={styles.addButton} onClick={openAddModal}>
          <PlusIcon />
        </button>
      </header>

      {/* PR List — visually identical cards, tappable */}
      <div className={styles.prList}>
        {loading ? (
          <div className={styles.loadingState}>
            <span className={styles.loadingText}>Loading PRs...</span>
          </div>
        ) : error ? (
          <div className={styles.errorState}>
            <span className={styles.errorText}>Failed to load PRs</span>
          </div>
        ) : uniquePRs.length === 0 ? (
          <motion.div
            className={styles.emptyState}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className={styles.emptyIcon}>
              <TrophyIcon />
            </div>
            <p className={styles.emptyTitle}>No Records Yet</p>
            <p className={styles.emptyText}>
              Start logging workouts or tap + to add a record manually.
            </p>
          </motion.div>
        ) : (
          uniquePRs.map((pr, index) => {
            const category = getMovementCategory(pr.movement);
            return (
              <motion.div
                key={pr.id}
                className={styles.trophyCard}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + index * 0.04, duration: 0.3 }}
                onClick={() => openActionSheet(pr)}
              >
                <div className={styles.cardLeft}>
                  <span className={styles.movementName}>{pr.movement}</span>
                  <div className={styles.dateRow}>
                    <span className={styles.cardDate}>{formatDate(pr.date)}</span>
                    {pr.workoutId && <LinkIcon />}
                  </div>
                </div>
                <div className={styles.cardRight}>
                  <span className={`${styles.heroNumber} ${heroColorClass(category)}`}>
                    {pr.weight}
                  </span>
                  <span className={styles.heroUnit}>kg</span>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* ========== Action Bottom Sheet ========== */}
      <AnimatePresence>
        {actionPR && (
          <>
            <motion.div
              className={styles.sheetBackdrop}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeActionSheet}
            />
            <motion.div
              className={styles.actionSheet}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              {/* Context header */}
              <div className={styles.actionSheetHeader}>
                <span className={styles.actionSheetMovement}>{actionPR.movement}</span>
                <span className={styles.actionSheetRecord}>{actionPR.weight} kg</span>
              </div>

              {/* Actions */}
              <div className={styles.actionSheetBody}>
                <button className={styles.actionBtn} onClick={handleEditTap}>
                  Edit Record
                </button>
                <button
                  className={`${styles.actionBtn} ${styles.actionBtnDelete} ${deleteConfirming ? styles.actionBtnDeleteConfirm : ''}`}
                  onClick={handleDeleteTap}
                  disabled={saving}
                >
                  {saving
                    ? 'Deleting...'
                    : deleteConfirming
                    ? 'Tap again to confirm'
                    : 'Delete Record'}
                </button>
              </div>

              {/* Cancel */}
              <button className={styles.actionBtnCancel} onClick={closeActionSheet}>
                Cancel
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ========== Add / Edit Record Modal (Full-Screen) ========== */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            className={styles.addModal}
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          >
            {/* Modal Header */}
            <header className={styles.modalHeader}>
              <button className={styles.modalCancel} onClick={closeAddModal}>
                Cancel
              </button>
              <h2 className={styles.modalTitle}>{modalTitle}</h2>
              <button
                className={`${styles.modalSave} ${canSave ? styles.modalSaveEnabled : ''}`}
                onClick={handleSave}
                disabled={!canSave || saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </header>

            <div className={styles.modalBody}>
              {/* Step 1: Search & Select Movement (only in add mode) */}
              {!selectedMovement ? (
                <>
                  <div className={styles.searchContainer}>
                    <SearchIcon />
                    <input
                      ref={searchInputRef}
                      type="text"
                      className={styles.searchInput}
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search movement..."
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    {searchQuery && (
                      <button
                        className={styles.clearSearch}
                        onClick={() => setSearchQuery('')}
                      >
                        &times;
                      </button>
                    )}
                  </div>

                  <div className={styles.suggestionList}>
                    {suggestions.length > 0 ? (
                      suggestions.map(name => (
                        <button
                          key={name}
                          className={styles.suggestionRow}
                          onClick={() => selectMovement(name)}
                        >
                          <span className={styles.suggestionName}>{name}</span>
                        </button>
                      ))
                    ) : (
                      <div className={styles.noResults}>
                        <span className={styles.noResultsText}>No matching movements</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* Step 2: Value Input */
                <div className={styles.valueStep}>
                  {/* Selected movement chip */}
                  <button
                    className={`${styles.selectedChip} ${editingPR ? styles.selectedChipLocked : ''}`}
                    onClick={clearSelection}
                  >
                    <CheckIcon />
                    <span className={styles.selectedChipText}>{selectedMovement}</span>
                    {!editingPR && (
                      <span className={styles.selectedChipChange}>Change</span>
                    )}
                  </button>

                  {/* Massive number input */}
                  <div className={styles.valueInputArea}>
                    <input
                      ref={valueInputRef}
                      type="number"
                      className={styles.heroInput}
                      value={addValue}
                      onChange={e => setAddValue(e.target.value)}
                      placeholder="0"
                      inputMode="decimal"
                    />
                    <span className={styles.heroInputUnit}>{addUnit}</span>
                  </div>

                  {/* Unit segmented control */}
                  <div className={styles.unitSegmented}>
                    {(['kg', 'lb', 'min', 'reps'] as AddUnit[]).map(unit => (
                      <button
                        key={unit}
                        className={`${styles.unitSegment} ${addUnit === unit ? styles.unitSegmentActive : ''}`}
                        onClick={() => setAddUnit(unit)}
                      >
                        {unit}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
