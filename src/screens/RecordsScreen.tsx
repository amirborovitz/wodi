import { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useRecords,
  FRESH_PR_DAYS,
  type RecordDraft,
  type RecordEntry,
} from '../hooks/useRecords';
import { AddRecordSheet } from '../components/records/AddRecordSheet';
import styles from './RecordsScreen.module.css';

interface RecordsScreenProps {
  onBack: () => void;
}

type RecordFilter = 'all' | 'lifts' | 'benchmarks';

const FILTERS: ReadonlyArray<[RecordFilter, string]> = [
  ['all', 'All'],
  ['lifts', 'Lifts'],
  ['benchmarks', 'Benchmarks'],
];

/** The nudges a barbell actually moves in. A record climbs in plates, not by typing. */
const STEPS = [-2.5, 2.5, 5];

/** How many months back the "set" picker offers. */
const MONTH_CHOICES = 12;

function formatMonth(date: Date): string {
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function isFresh(date: Date): boolean {
  return Date.now() - date.getTime() < FRESH_PR_DAYS * 24 * 60 * 60 * 1000;
}

function ChevronLeftIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 6 9 12 15 18" />
    </svg>
  );
}

function SearchIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  );
}

function PlusIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function PencilIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className={styles.pencilIcon}>
      <path d="M17 3a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function CloseIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z" />
    </svg>
  );
}

/**
 * A record's own tile. Fresh records carry the star and a warm border — the board's job is to
 * make the last month visible at a glance, not to rank everything against everything.
 */
function RecordCard({ entry, onTap }: { entry: RecordEntry; onTap: () => void }): React.ReactElement {
  const fresh = isFresh(entry.achievedAt);
  return (
    <button
      type="button"
      className={`${styles.card} ${fresh ? styles.cardFresh : ''}`}
      onClick={onTap}
    >
      <span className={styles.cardHead}>
        <span className={styles.cardName}>{entry.movement}</span>
        {fresh && <StarIcon className={styles.cardStar} />}
      </span>
      <span className={styles.cardFoot}>
        <span className={styles.cardValue}>{entry.value}</span>
        <span className={styles.cardDate}>{formatMonth(entry.achievedAt).toUpperCase()}</span>
      </span>
    </button>
  );
}

/**
 * The months a record can be moved to: this month back a year, plus the record's own month
 * when it is older than that, so the value it already holds is always in the list.
 */
function monthOptions(current: Date): Array<{ key: string; date: Date }> {
  const out: Array<{ key: string; date: Date }> = [];
  const now = new Date();
  for (let i = 0; i < MONTH_CHOICES; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: formatMonth(date), date });
  }
  const currentKey = formatMonth(current);
  if (!out.some((o) => o.key === currentKey)) {
    out.push({ key: currentKey, date: new Date(current.getFullYear(), current.getMonth(), 1) });
  }
  return out;
}

/**
 * The delete fork.
 *
 * A movement keeps one row per PR event, so "delete" is genuinely two different actions and
 * guessing between them is how an athlete loses a record they meant to keep. Removing the top
 * row hands the movement back to the next-heaviest; removing every row retires the movement.
 * The sheet names both outcomes in full — including which number takes over — so the choice is
 * made on what will happen, not on which button is redder.
 */
function DeleteChoiceSheet({
  entry,
  busy,
  onDeleteTop,
  onDeleteAll,
  onCancel,
}: {
  entry: RecordEntry;
  busy: boolean;
  onDeleteTop: () => void;
  onDeleteAll: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const record = entry.history.find((a) => a.isBest) ?? entry.history[0];
  const rest = entry.history.filter((a) => a !== record);
  // Whichever row inherits the movement — the heaviest of what is left, which is not always
  // the most recent, so it is spelled out rather than implied.
  const successor = [...rest].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0];

  return (
    <>
      <motion.button
        type="button"
        className={styles.choiceBackdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
        aria-label="Cancel"
      />
      <motion.div
        className={styles.choiceSheet}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 400, damping: 38 }}
      >
        <div className={styles.sheetHandle} />
        <p className={styles.choiceEyebrow}>{entry.movement}</p>

        <button type="button" className={styles.choiceOption} onClick={onDeleteTop} disabled={busy}>
          <span className={styles.choiceTitle}>Delete {record.value}</span>
          <span className={styles.choiceBody}>
            {successor
              ? `${successor.value} becomes your record.`
              : 'The only record — this removes the movement.'}
          </span>
        </button>

        {rest.length > 0 && (
          <button type="button" className={styles.choiceOption} onClick={onDeleteAll} disabled={busy}>
            <span className={styles.choiceTitle}>Delete all {entry.history.length}</span>
            <span className={styles.choiceBody}>
              Every record for this movement. It leaves your board.
            </span>
          </button>
        )}

        <button type="button" className={styles.choiceCancel} onClick={onCancel} disabled={busy}>
          {busy ? 'Deleting…' : 'Cancel'}
        </button>
      </motion.div>
    </>
  );
}

function DetailSheet({
  entry,
  busy,
  onSave,
  onDelete,
  onClose,
}: {
  entry: RecordEntry;
  busy: boolean;
  onSave: (change: { weight: number; date: Date }) => void;
  onDelete: () => void;
  onClose: () => void;
}): React.ReactElement {
  // A benchmark's time is read off the workout that set it, so there is nothing here to edit —
  // the way to change one is to correct the workout.
  const editable = entry.kind === 'lift';
  const record = entry.history.find((a) => a.isBest) ?? entry.history[0];
  const earlier = entry.history.filter((a) => a !== record);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(record.weight ?? ''));
  const [monthKey, setMonthKey] = useState(formatMonth(record.date));
  const inputRef = useRef<HTMLInputElement>(null);

  const months = useMemo(() => monthOptions(record.date), [record.date]);
  const parsed = parseFloat(draft);
  const dirty = (parsed > 0 && parsed !== record.weight) || monthKey !== formatMonth(record.date);

  const openEdit = (): void => {
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  const cancelEdit = (): void => {
    setEditing(false);
    setDraft(String(record.weight ?? ''));
    setMonthKey(formatMonth(record.date));
  };

  // Steppers move the number the way plates do. Rounded to one decimal so repeated 2.5 nudges
  // never drift into 47.49999.
  const step = (by: number): void => {
    setDraft((v) => String(Math.max(0, Math.round(((parseFloat(v) || 0) + by) * 10) / 10)));
  };

  const commit = (): void => {
    if (!dirty || !(parsed > 0)) return;
    const month = months.find((m) => m.key === monthKey);
    // Keep the exact original timestamp when the month didn't change — rewriting it to the 1st
    // would silently move a record off the day it was actually set.
    const date = monthKey === formatMonth(record.date) ? record.date : (month?.date ?? record.date);
    onSave({ weight: parsed, date });
    setEditing(false);
  };

  return (
    <>
      <motion.button
        type="button"
        className={styles.backdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-label="Close"
      />
      <motion.div
        className={styles.sheet}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      >
        <div className={styles.sheetHandle} />

        <div className={styles.sheetHeader}>
          <div className={styles.sheetHeadText}>
            <div className={styles.sheetEyebrowRow}>
              <span className={styles.sheetEyebrow}>
                {entry.kind === 'benchmark' ? 'Benchmark' : 'Personal record'}
              </span>
              {isFresh(entry.achievedAt) && (
                <span className={styles.newBadge}>
                  <StarIcon className={styles.newBadgeStar} />
                  NEW
                </span>
              )}
            </div>
            <h2 className={styles.sheetTitle}>{entry.movement}</h2>
            {entry.loggedNames > 1 && (
              <p className={styles.mergedNote}>merged from {entry.loggedNames} logged names</p>
            )}
          </div>
          <button type="button" className={styles.glassBtn} onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {/* The number IS the control: tapping it opens the editor in place, at the same size
            and position, so nothing jumps and nothing is duplicated below it. */}
        <div className={styles.heroBlock}>
          {!editing ? (
            <button
              type="button"
              className={styles.heroRow}
              onClick={editable ? openEdit : undefined}
              disabled={!editable}
            >
              <span className={styles.heroValue}>{entry.value}</span>
              <span className={styles.heroDate}>{formatMonth(entry.achievedAt).toUpperCase()}</span>
              {editable && (
                <span className={styles.editPill}>
                  <PencilIcon />
                  Edit
                </span>
              )}
            </button>
          ) : (
            <div>
              <div className={styles.heroField}>
                <input
                  ref={inputRef}
                  type="number"
                  inputMode="decimal"
                  className={styles.heroInput}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
                  aria-label="Load in kilograms"
                />
                <span className={styles.heroUnit}>kg</span>
              </div>
              <div className={styles.stepRow}>
                {STEPS.map((by) => (
                  <button key={by} type="button" className={styles.stepBtn} onClick={() => step(by)}>
                    {by > 0 ? `+${by}` : `−${Math.abs(by)}`}
                  </button>
                ))}
              </div>
              <div className={styles.setRow}>
                <span className={styles.setLabel}>Set</span>
                <select
                  className={styles.setSelect}
                  value={monthKey}
                  onChange={(e) => setMonthKey(e.target.value)}
                  aria-label="Month this record was set"
                >
                  {months.map((m) => <option key={m.key} value={m.key}>{m.key}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* The climb, written as a sentence rather than drawn as a chart — it is there to be
            proud of, not measured off an axis. */}
        <div className={styles.beforeBlock}>
          {/* "Before this" over an empty block asks the reader to look for something that isn't
              there. With nothing behind it the block is about the mark itself, so it says so. */}
          <p className={styles.beforeLabel}>{earlier.length > 0 ? 'Before this' : 'The start'}</p>
          {earlier.length > 0 ? (
            <div className={styles.beforeRow}>
              {earlier.map((attempt, i) => (
                <span key={attempt.id} className={styles.beforeItem}>
                  {i > 0 && <span className={styles.beforeArrow}>←</span>}
                  <span className={styles.beforeValue}>{attempt.value}</span>
                  <span className={styles.beforeDate}>{formatMonth(attempt.date)}</span>
                </span>
              ))}
            </div>
          ) : (
            // Most records are held by a single row — a lift set once has nothing behind it yet.
            // Said as the beginning of something rather than as a lack of something.
            <p className={styles.beforeEmpty}>Your first mark on this lift. The climb starts here.</p>
          )}
        </div>

        {editing && (
          <>
            <div className={styles.editActions}>
              <button type="button" className={styles.cancelBtn} onClick={cancelEdit} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.saveBtn}
                onClick={commit}
                disabled={!dirty || busy}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
            <div className={styles.deleteRow}>
              <button type="button" className={styles.deleteBtn} onClick={onDelete} disabled={busy}>
                Delete this record
              </button>
            </div>
          </>
        )}
      </motion.div>
    </>
  );
}

export function RecordsScreen({ onBack }: RecordsScreenProps): React.ReactElement {
  const {
    lifts, benchmarks, total, freshCount, loading, saving, saveRecord, deleteRecords,
  } = useRecords();
  const [filter, setFilter] = useState<RecordFilter>('all');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [choosingDelete, setChoosingDelete] = useState(false);

  const all = useMemo(() => [...lifts, ...benchmarks]
    .sort((a, b) => b.achievedAt.getTime() - a.achievedAt.getTime()), [lifts, benchmarks]);

  // Read the open sheet's entry out of the live list rather than holding a copy: a save or a
  // delete re-reads Firestore, and a snapshot taken at open time would show the old number.
  const selected = selectedId ? all.find((e) => e.id === selectedId) ?? null : null;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((e) => filter === 'all' || (filter === 'lifts' ? e.kind === 'lift' : e.kind === 'benchmark'))
      .filter((e) => !q || e.movement.toLowerCase().includes(q));
  }, [all, filter, query]);

  const knownMovements = useMemo(() => lifts.map((e) => e.movement), [lifts]);

  const handleAdd = async (draft: RecordDraft): Promise<void> => {
    await saveRecord(draft);
    setAdding(false);
  };

  const handleSave = async (change: { weight: number; date: Date }): Promise<void> => {
    if (!selected) return;
    const row = selected.history.find((a) => a.isBest) ?? selected.history[0];
    await saveRecord({ id: row.id, movement: selected.movement, ...change });
  };

  const handleDeleteTop = async (): Promise<void> => {
    if (!selected) return;
    const row = selected.history.find((a) => a.isBest) ?? selected.history[0];
    const wasOnlyRow = selected.history.length === 1;
    await deleteRecords([row.id]);
    setChoosingDelete(false);
    // With one row the movement itself is gone; with more, the next heaviest takes over and the
    // sheet keeps showing the same movement with its new number.
    if (wasOnlyRow) setSelectedId(null);
  };

  const handleDeleteAll = async (): Promise<void> => {
    if (!selected) return;
    await deleteRecords(selected.history.map((a) => a.id));
    setChoosingDelete(false);
    setSelectedId(null);
  };

  return (
    <div className={styles.screen}>
      <motion.div
        className={styles.header}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
      >
        <button type="button" className={styles.glassBtn} onClick={onBack} aria-label="Go back">
          <ChevronLeftIcon />
        </button>
        <div className={styles.headText}>
          <h1 className={styles.pageTitle}>Records</h1>
          <p className={styles.pageSubtitle}>
            {loading ? 'Loading…' : (
              <>
                {total} best{total === 1 ? '' : 's'}
                {freshCount > 0 && (
                  <> · <span className={styles.freshCount}>{freshCount} new this month</span></>
                )}
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          className={`${styles.glassBtn} ${searching ? styles.glassBtnOn : ''}`}
          onClick={() => { setSearching((s) => !s); setQuery(''); }}
          aria-label={searching ? 'Close search' : 'Search records'}
        >
          <SearchIcon />
        </button>
        <button type="button" className={styles.glassBtn} onClick={() => setAdding(true)} aria-label="Add a record">
          <PlusIcon />
        </button>
      </motion.div>

      {searching && (
        <motion.input
          type="text"
          className={styles.searchField}
          placeholder="Find a movement…"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
        />
      )}

      <div className={styles.filters}>
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`${styles.pill} ${filter === key ? styles.pillOn : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.grid}>
          {[0, 1, 2, 3].map((i) => <div key={i} className={styles.skeleton} />)}
        </div>
      ) : visible.length === 0 ? (
        <motion.div className={styles.emptyState} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <span className={styles.emptyIcon}>★</span>
          <p className={styles.emptyText}>
            {total === 0
              ? 'Your records will appear here after your first PR. Keep grinding.'
              : 'Nothing here under that filter.'}
          </p>
          {total === 0 && (
            <button type="button" className={styles.emptyAddBtn} onClick={() => setAdding(true)}>
              Add one by hand
            </button>
          )}
        </motion.div>
      ) : (
        <div className={styles.grid}>
          {visible.map((entry, i) => (
            <motion.div
              key={entry.id}
              className={styles.gridItem}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(0.03 * i, 0.24), duration: 0.24 }}
            >
              <RecordCard entry={entry} onTap={() => setSelectedId(entry.id)} />
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <DetailSheet
            key={selected.id}
            entry={selected}
            busy={saving}
            onSave={handleSave}
            onDelete={() => setChoosingDelete(true)}
            onClose={() => setSelectedId(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {choosingDelete && selected && (
          <DeleteChoiceSheet
            entry={selected}
            busy={saving}
            onDeleteTop={handleDeleteTop}
            onDeleteAll={handleDeleteAll}
            onCancel={() => setChoosingDelete(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {adding && (
          <AddRecordSheet
            knownMovements={knownMovements}
            saving={saving}
            onSave={handleAdd}
            onClose={() => setAdding(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
