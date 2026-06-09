import { useEffect, useMemo, useRef, useState } from "react";

type RoutineItem = {
  id: string;
  label: string;
};

type RoutineTab = {
  id: string;
  name: string;
  notes: string;
  items: RoutineItem[];
  completedByDate: Record<string, string[]>;
};

type Props = {
  userId: string;
  todayDate: string;
  onClose: () => void;
  onCreateBlock: (label: string) => Promise<void>;
};

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const defaultRoutines = (): RoutineTab[] => [
  {
    id: createId("routine"),
    name: "Morning",
    notes: "Keep this visible while setting up the day.",
    items: [
      { id: createId("routine-item"), label: "Water" },
      { id: createId("routine-item"), label: "Skincare" },
      { id: createId("routine-item"), label: "Stretch or mobility" },
      { id: createId("routine-item"), label: "Review calendar" },
      { id: createId("routine-item"), label: "Breakfast" },
    ],
    completedByDate: {},
  },
  {
    id: createId("routine"),
    name: "Evening",
    notes: "Use this as a shutdown checklist before tomorrow.",
    items: [
      { id: createId("routine-item"), label: "Kitchen reset" },
      { id: createId("routine-item"), label: "Prep clothes" },
      { id: createId("routine-item"), label: "Skincare" },
      { id: createId("routine-item"), label: "Plan tomorrow" },
      { id: createId("routine-item"), label: "Read" },
    ],
    completedByDate: {},
  },
];

export default function RoutineNotesPopup({ userId, todayDate, onClose, onCreateBlock }: Props) {
  const storageKey = `routine-notes:${userId}`;
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
    () => routines.find((routine) => routine.id === activeRoutineId) ?? null,
    [routines, activeRoutineId]
  );
  const completedItemIds = new Set(activeRoutine?.completedByDate[todayDate] ?? []);
  const openItems = activeRoutine?.items.filter((item) => !completedItemIds.has(item.id)) ?? [];

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      const loaded = saved ? (JSON.parse(saved) as RoutineTab[]) : defaultRoutines();
      setRoutines(loaded);
      setActiveRoutineId(loaded[0]?.id ?? null);
    } catch {
      const defaults = defaultRoutines();
      setRoutines(defaults);
      setActiveRoutineId(defaults[0]?.id ?? null);
    }
  }, [storageKey]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const saveRoutines = (next: RoutineTab[]) => {
    setRoutines(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
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
      id: createId("routine"),
      name,
      notes: "",
      items: [],
      completedByDate: {},
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
      items: [...activeRoutine.items, { id: createId("routine-item"), label }],
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

  const toggleItem = (itemId: string) => {
    if (!activeRoutine) return;
    const current = activeRoutine.completedByDate[todayDate] ?? [];
    const nextIds = current.includes(itemId)
      ? current.filter((id) => id !== itemId)
      : [...current, itemId];
    updateRoutine(activeRoutine.id, {
      completedByDate: {
        ...activeRoutine.completedByDate,
        [todayDate]: nextIds,
      },
    });
  };

  const addOpenItemsToBlocks = async () => {
    for (const item of openItems) {
      await onCreateBlock(item.label);
    }
  };

  return (
    <div className="routine-notes-panel" ref={panelRef}>
      <div className="routine-notes-header">
        <span className="routine-notes-title">Routine Notes</span>
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
          <button className="routine-notes-btn" onClick={onClose} title="Close">
            x
          </button>
        </div>
      </div>

      <div className="routine-tab-strip">
        {routines.map((routine) => (
          <button
            key={routine.id}
            className={`routine-tab ${routine.id === activeRoutineId ? "routine-tab--active" : ""}`}
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
              <span>{activeRoutine.items.length - openItems.length}/{activeRoutine.items.length} done today</span>
            </div>

            <div className="routine-checklist">
              {activeRoutine.items.length === 0 && (
                <div className="routine-empty">Add items you want visible as options.</div>
              )}
              {activeRoutine.items.map((item) => {
                const done = completedItemIds.has(item.id);
                return (
                  <div key={item.id} className={`routine-item ${done ? "routine-item--done" : ""}`}>
                    <button
                      className={`routine-checkbox ${done ? "routine-checkbox--checked" : ""}`}
                      onClick={() => toggleItem(item.id)}
                      aria-label={done ? "Mark incomplete" : "Mark complete"}
                    >
                      {done ? "✓" : ""}
                    </button>
                    {editMode ? (
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
                    <button
                      className="routine-to-block"
                      onClick={() => onCreateBlock(item.label)}
                      title="Add as unscheduled block"
                    >
                      + Block
                    </button>
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
            <button
              type="button"
              onClick={addOpenItemsToBlocks}
              disabled={openItems.length === 0}
            >
              Add open items
            </button>
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
