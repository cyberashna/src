import { useEffect, useMemo, useRef, useState } from "react";
import { RoutineRunner } from './RoutineWidget';
import { Star } from 'lucide-react';
import {
  createRoutineId,
  inferRoutineCategory,
  inferRoutineCategoryFromRoutine,
  loadRoutineNotes,
  saveRoutineNotes,
  resolveRoutineOutlineLabels,
  type RoutineTab,
} from "../services/routineNotes";

type WorkoutRoutineSummary = {
  id: string;
  name: string;
  exercises: unknown[];
};

type Props = {
  userId: string;
  outlineItems?: { id: string; text: string; children?: { id: string; text: string }[] }[];
  onOpenOutlineItem?: (id: string) => void;
  initialRoutineId?: string;
  onClose: () => void;
  onCreateRoutineBlock: (routine: RoutineTab) => Promise<void>;
  workoutRoutines?: WorkoutRoutineSummary[];
  onCreateWorkoutFromRoutine?: (routineId: string) => Promise<void>;
};

export default function RoutineNotesPopup({
  userId,
  outlineItems = [],
  onOpenOutlineItem,
  initialRoutineId,
  onClose,
  onCreateRoutineBlock,
  workoutRoutines = [],
  onCreateWorkoutFromRoutine,
}: Props) {
  const [routines, setRoutines] = useState<RoutineTab[]>([]);
  const [activeRoutineId, setActiveRoutineId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [editRoutineName, setEditRoutineName] = useState("");
  const [addingRoutine, setAddingRoutine] = useState(false);
  const [newRoutineName, setNewRoutineName] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [newItemLabel, setNewItemLabel] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  const activeRoutine = useMemo(
    () => resolveRoutineOutlineLabels(routines, outlineItems).find((routine) => routine.id === activeRoutineId) ?? null,
    [routines, activeRoutineId, outlineItems]
  );
  const linkedWorkoutRoutine = useMemo(
    () =>
      activeRoutine?.linkedWorkoutRoutineId
        ? workoutRoutines.find((routine) => routine.id === activeRoutine.linkedWorkoutRoutineId) ?? null
        : null,
    [activeRoutine, workoutRoutines]
  );
  useEffect(() => {
    const loaded = loadRoutineNotes(userId);
    setRoutines(loaded);
    setActiveRoutineId(loaded.find(routine => routine.id === initialRoutineId)?.id ?? loaded[0]?.id ?? null);
  }, [userId, initialRoutineId]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-overlay-toggle]")) return;
      if (target?.closest('dialog')) return;
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const withHiddenCategory = (routine: RoutineTab): RoutineTab => ({
    ...routine,
    category: inferRoutineCategoryFromRoutine(routine),
  });

  const saveRoutines = (next: RoutineTab[]) => {
    const tagged = next.map(withHiddenCategory);
    setRoutines(tagged);
    saveRoutineNotes(userId, tagged);
  };

  const updateRoutine = (routineId: string, updates: Partial<RoutineTab>) => {
    saveRoutines(
      routines.map((routine) =>
        routine.id === routineId ? { ...routine, ...updates } : routine
      )
    );
  };

  const addRoutine = () => {
    const name = newRoutineName.trim();
    if (!name) return;
    const routine: RoutineTab = {
      id: createRoutineId("routine"),
      name,
      category: inferRoutineCategory(name),
      notes: "",
      items: [],
      completedByDate: {},
      linkedWorkoutRoutineId: null,
    };
    saveRoutines([...routines, routine]);
    setActiveRoutineId(routine.id);
    setAddingRoutine(false);
    setNewRoutineName("");
  };

  const deleteRoutine = (routineId: string) => {
    const next = routines.filter((routine) => routine.id !== routineId);
    saveRoutines(next);
    if (activeRoutineId === routineId) {
      setActiveRoutineId(next[0]?.id ?? null);
    }
    setEditingRoutineId(null);
  };

  const saveRoutineName = () => {
    if (!editingRoutineId) return;
    updateRoutine(editingRoutineId, { name: editRoutineName.trim() || "Routine" });
    setEditingRoutineId(null);
    setEditRoutineName("");
  };

  const addItem = () => {
    if (!activeRoutine) return;
    const label = newItemLabel.trim();
    if (!label) return;
    updateRoutine(activeRoutine.id, {
      items: [...activeRoutine.items, { id: createRoutineId("routine-item"), label }],
    });
    setNewItemLabel("");
  };

  const updateItem = (itemId: string, label: string) => {
    if (!activeRoutine) return;
    updateRoutine(activeRoutine.id, {
      items: activeRoutine.items.map((item) =>
        item.id === itemId ? { ...item, label } : item
      ),
    });
  };

  const deleteItem = (itemId: string) => {
    if (!activeRoutine) return;
    updateRoutine(activeRoutine.id, {
      items: activeRoutine.items.filter((item) => item.id !== itemId),
      completedByDate: Object.fromEntries(
        Object.entries(activeRoutine.completedByDate).map(([date, ids]) => [
          date,
          ids.filter((id) => id !== itemId),
        ])
      ),
    });
  };

  const createRoutineBlock = async () => {
    if (!activeRoutine) return;
    await onCreateRoutineBlock(activeRoutine);
  };

  const linkWorkoutRoutine = (workoutRoutineId: string) => {
    if (!activeRoutine) return;
    updateRoutine(activeRoutine.id, {
      linkedWorkoutRoutineId: workoutRoutineId || null,
    });
  };

  return (
    <div className="routine-notes-panel" ref={panelRef}>
      <div className="routine-notes-header">
        <span className="routine-notes-title">Routines</span>
        <div className="routine-notes-actions">
          {editMode && activeRoutine && (
            <button
              className="routine-notes-btn routine-notes-btn--danger"
              onClick={() => deleteRoutine(activeRoutine.id)}
              title="Delete this routine"
              disabled={routines.length <= 1}
            >
              Delete
            </button>
          )}
          <button
            className={`routine-notes-btn ${editMode ? "routine-notes-btn--active" : ""}`}
            onClick={() => {
              setEditMode((value) => !value);
              setAddingItem(false);
              setAddingRoutine(false);
              setEditingRoutineId(null);
            }}
          >
            {editMode ? "Done" : "Edit"}
          </button>
          <button className="routine-notes-btn routine-notes-close-btn" onClick={onClose} title="Close">
            x
          </button>
        </div>
      </div>

      <div className="routine-tab-strip">
        {routines.map((routine) => (
          <button
            key={routine.id}
            className={`routine-tab routine-tab--${routine.category} ${routine.id === activeRoutineId ? "routine-tab--active" : ""}`}
            onClick={() => setActiveRoutineId(routine.id)}
          >
            {editMode && editingRoutineId === routine.id ? (
              <input
                className="routine-inline-input"
                value={editRoutineName}
                onChange={(event) => setEditRoutineName(event.target.value)}
                onBlur={saveRoutineName}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveRoutineName();
                  if (event.key === "Escape") setEditingRoutineId(null);
                }}
                onClick={(event) => event.stopPropagation()}
                autoFocus
              />
            ) : (
              <span
                onDoubleClick={() => {
                  if (!editMode) return;
                  setEditingRoutineId(routine.id);
                  setEditRoutineName(routine.name);
                }}
              >
                {routine.name}
              </span>
            )}
          </button>
        ))}
        {addingRoutine ? (
          <div className="routine-new-tab">
            <input
              className="routine-inline-input"
              value={newRoutineName}
              onChange={(event) => setNewRoutineName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addRoutine();
                if (event.key === "Escape") setAddingRoutine(false);
              }}
              placeholder="Routine name"
              autoFocus
            />
            <button className="routine-notes-btn routine-notes-btn--dark" onClick={addRoutine}>
              +
            </button>
          </div>
        ) : (
          <button className="routine-tab-add" onClick={() => setAddingRoutine(true)} title="Add routine">
            +
          </button>
        )}
      </div>

      {activeRoutine ? (
        <>
          <div className="routine-notes-body">
            {!editMode && <RoutineRunner key={activeRoutine.id} userId={userId} routine={activeRoutine} />}
            {editMode && <>
            <label className="routine-section-label">Notes</label>
            <textarea
              className="routine-note-box"
              value={activeRoutine.notes}
              onChange={(event) => updateRoutine(activeRoutine.id, { notes: event.target.value })}
              placeholder={`Notes for ${activeRoutine.name}...`}
              rows={4}
            />

            <div className="routine-checklist-header">
              <span className="routine-section-label">Checklist</span>
              <span>{activeRoutine.items.length} steps</span>
            </div>

            <div className="routine-checklist">
              {activeRoutine.items.length === 0 && (
                <div className="routine-empty">No routine items here yet.</div>
              )}
              {activeRoutine.items.map((item) => {
                return (
                  <div key={item.id} className="routine-item">
                    <button type="button" className="routine-essential-toggle" aria-pressed={!!item.essential}
                      aria-label={`Essential step: ${item.label}`} title={item.essential ? 'Remove from essentials' : 'Mark as essential'}
                      onClick={() => updateRoutine(activeRoutine.id, { items: activeRoutine.items.map(entry => entry.id === item.id ? { ...entry, essential: !entry.essential } : entry) })}>
                      <Star size={18} fill={item.essential ? 'currentColor' : 'none'} />
                    </button>
                    {editMode && !item.sourceOutlineId ? (
                      <input
                        className="routine-item-input"
                        defaultValue={item.label}
                        onBlur={(event) => updateItem(item.id, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            updateItem(item.id, (event.target as HTMLInputElement).value);
                            (event.target as HTMLInputElement).blur();
                          }
                        }}
                      />
                    ) : (
                      <span className="routine-item-label">{item.label}</span>
                    )}
                    {editMode && item.sourceOutlineId && onOpenOutlineItem && <button type="button" onClick={() => onOpenOutlineItem(item.sourceOutlineId!)}>Open in Outline</button>}
                    {editMode && (
                      <button
                        className="routine-delete-item"
                        onClick={() => deleteItem(item.id)}
                        title="Delete item"
                      >
                        x
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            </>}

            {activeRoutine.category === "workout" && (
              <div className="routine-workout-link">
                <div className="routine-checklist-header">
                  <span className="routine-section-label">Workout routine</span>
                  {linkedWorkoutRoutine && (
                    <span>
                      {linkedWorkoutRoutine.exercises.length} exercise
                      {linkedWorkoutRoutine.exercises.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                {workoutRoutines.length === 0 ? (
                  <div className="routine-empty">Save a workout routine from the library first.</div>
                ) : (
                  <div className="routine-workout-controls">
                    <select
                      value={activeRoutine.linkedWorkoutRoutineId ?? ""}
                      onChange={(event) => linkWorkoutRoutine(event.target.value)}
                    >
                      <option value="">No workout linked</option>
                      {workoutRoutines.map((routine) => (
                        <option key={routine.id} value={routine.id}>
                          {routine.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        if (linkedWorkoutRoutine && onCreateWorkoutFromRoutine) {
                          onCreateWorkoutFromRoutine(linkedWorkoutRoutine.id);
                        }
                      }}
                      disabled={!linkedWorkoutRoutine || !onCreateWorkoutFromRoutine}
                    >
                      Add workout block
                    </button>
                  </div>
                )}
              </div>
            )}

            {editMode && (
              <div className="routine-add-item-row">
                {addingItem ? (
                  <>
                    <input
                      className="routine-new-item-input"
                      value={newItemLabel}
                      onChange={(event) => setNewItemLabel(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") addItem();
                        if (event.key === "Escape") {
                          setAddingItem(false);
                          setNewItemLabel("");
                        }
                      }}
                      placeholder="New routine item..."
                      autoFocus
                    />
                    <button className="routine-add-item-btn" onClick={addItem}>Add</button>
                  </>
                ) : (
                  <button className="routine-add-item-btn" onClick={() => setAddingItem(true)}>
                    + Add item
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="routine-notes-footer">
            <span>Kept off-calendar until you add it.</span>
            <div className="routine-footer-actions">
	              <button
	                type="button"
	                onClick={createRoutineBlock}
	                disabled={activeRoutine.items.length === 0 && !activeRoutine.notes.trim()}
	              >
	                Add routine to planner
	              </button>
	            </div>
	          </div>
        </>
      ) : (
        <div className="routine-notes-body">
          <div className="routine-empty">Add a routine tab to get started.</div>
        </div>
      )}
    </div>
  );
}
