import { useState, useEffect, useRef, useCallback } from "react";
import { database as db } from "../services/database";
import type {
  PlanningTemplate,
  TemplateChecklistItem,
  TemplateCompletion,
} from "../services/database";

interface Props {
  userId: string;
  weekStartDate: string;
  todayDate: string;
  onClose: () => void;
}

const DEFAULT_WEEKLY_ITEMS = [
  "Pick 6 meals for the week",
  "Plan workouts",
  "Places to visit this week",
  "Review last week",
];

const DEFAULT_DAILY_ITEMS = [
  "Plan outfit for tomorrow",
  "Check in on meals",
  "Plan skincare and makeup",
  "Review tomorrow's priorities",
];

function getCompletionDate(template: PlanningTemplate, weekStartDate: string, todayDate: string) {
  return template.type === "weekly" ? weekStartDate : todayDate;
}

export default function TemplateStickyNote({ userId, weekStartDate, todayDate, onClose }: Props) {
  const [templates, setTemplates] = useState<PlanningTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [itemsByTemplate, setItemsByTemplate] = useState<Record<string, TemplateChecklistItem[]>>({});
  const [completions, setCompletions] = useState<TemplateCompletion[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemLabel, setNewItemLabel] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editTemplateName, setEditTemplateName] = useState("");
  const [editTemplateIcon, setEditTemplateIcon] = useState("");
  const [addingTemplate, setAddingTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateIcon, setNewTemplateIcon] = useState("");
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const seedingRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const newItemInputRef = useRef<HTMLInputElement>(null);

  const activeTemplate = templates.find((t) => t.id === activeTemplateId) ?? null;
  const activeItems = activeTemplateId ? (itemsByTemplate[activeTemplateId] ?? []) : [];
  const completionDate = activeTemplate
    ? getCompletionDate(activeTemplate, weekStartDate, todayDate)
    : todayDate;

  const completedItemIds = new Set(
    completions
      .filter((c) => c.completed_date === completionDate)
      .map((c) => c.item_id)
  );

  const loadTemplates = useCallback(async () => {
    try {
      const data = await db.planningTemplates.getAll(userId);
      setTemplates(data);
      return data;
    } catch {
      return [];
    }
  }, [userId]);

  const loadItems = useCallback(async (templateId: string) => {
    try {
      const items = await db.templateChecklistItems.getByTemplate(templateId);
      setItemsByTemplate((prev) => ({ ...prev, [templateId]: items }));
      return items;
    } catch {
      return [];
    }
  }, []);

  const loadCompletions = useCallback(async () => {
    try {
      const dates = Array.from(new Set([weekStartDate, todayDate]));
      const data = await db.templateCompletions.getByDates(userId, dates);
      setCompletions(data);
    } catch {
      // ignore
    }
  }, [userId, weekStartDate, todayDate]);

  const seedDefaults = useCallback(async () => {
    try {
      const existing = await db.planningTemplates.getAll(userId);
      if (existing.length > 0) {
        setActiveTemplateId(existing[0].id);
        await loadItems(existing[0].id);
        return;
      }

      const weeklyTpl = await db.planningTemplates.create(userId, "Weekly", "📅", "weekly", 0, true);
      const dailyTpl = await db.planningTemplates.create(userId, "Daily", "☀️", "daily", 1, true);

      await Promise.all(
        DEFAULT_WEEKLY_ITEMS.map((label, i) =>
          db.templateChecklistItems.create(userId, weeklyTpl.id, label, i)
        )
      );
      await Promise.all(
        DEFAULT_DAILY_ITEMS.map((label, i) =>
          db.templateChecklistItems.create(userId, dailyTpl.id, label, i)
        )
      );

      const fresh = await loadTemplates();
      if (fresh.length > 0) {
        setActiveTemplateId(fresh[0].id);
        await loadItems(fresh[0].id);
      }
    } catch {
      // ignore
    }
  }, [userId, loadTemplates, loadItems]);

  useEffect(() => {
    if (seedingRef.current) return;
    seedingRef.current = true;

    (async () => {
      const data = await loadTemplates();
      if (data.length === 0) {
        await seedDefaults();
      } else {
        setActiveTemplateId(data[0].id);
        await loadItems(data[0].id);
      }
      await loadCompletions();
    })();
  }, [loadTemplates, loadItems, loadCompletions, seedDefaults]);

  useEffect(() => {
    if (activeTemplateId && !itemsByTemplate[activeTemplateId]) {
      loadItems(activeTemplateId);
    }
  }, [activeTemplateId, itemsByTemplate, loadItems]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  async function handleTabClick(templateId: string) {
    setActiveTemplateId(templateId);
    setEditMode(false);
    setAddingItem(false);
    setNewItemLabel("");
    if (!itemsByTemplate[templateId]) {
      await loadItems(templateId);
    }
  }

  async function handleToggleCompletion(itemId: string) {
    const isComplete = completedItemIds.has(itemId);
    try {
      if (isComplete) {
        await db.templateCompletions.uncheck(userId, itemId, completionDate);
        setCompletions((prev) =>
          prev.filter((c) => !(c.item_id === itemId && c.completed_date === completionDate))
        );
      } else {
        const c = await db.templateCompletions.check(userId, itemId, completionDate);
        setCompletions((prev) => [...prev.filter((x) => !(x.item_id === itemId && x.completed_date === completionDate)), c]);
      }
    } catch {
      // ignore
    }
  }

  async function handleAddItem() {
    const label = newItemLabel.trim();
    if (!label || !activeTemplateId) return;
    try {
      const nextOrder = activeItems.length;
      const item = await db.templateChecklistItems.create(userId, activeTemplateId, label, nextOrder);
      setItemsByTemplate((prev) => ({
        ...prev,
        [activeTemplateId]: [...(prev[activeTemplateId] ?? []), item],
      }));
      setNewItemLabel("");
      newItemInputRef.current?.focus();
    } catch {
      // ignore
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (!activeTemplateId) return;
    try {
      await db.templateChecklistItems.delete(itemId);
      setItemsByTemplate((prev) => ({
        ...prev,
        [activeTemplateId]: (prev[activeTemplateId] ?? []).filter((i) => i.id !== itemId),
      }));
      setCompletions((prev) => prev.filter((c) => c.item_id !== itemId));
    } catch {
      // ignore
    }
  }

  async function handleUpdateItemLabel(itemId: string, label: string) {
    if (!activeTemplateId) return;
    try {
      await db.templateChecklistItems.update(itemId, { label });
      setItemsByTemplate((prev) => ({
        ...prev,
        [activeTemplateId]: (prev[activeTemplateId] ?? []).map((i) =>
          i.id === itemId ? { ...i, label } : i
        ),
      }));
    } catch {
      // ignore
    }
  }

  async function handleSaveTemplateMeta() {
    if (!editingTemplateId) return;
    try {
      await db.planningTemplates.update(editingTemplateId, {
        name: editTemplateName.trim() || "Template",
        icon: editTemplateIcon.trim(),
      });
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === editingTemplateId
            ? { ...t, name: editTemplateName.trim() || "Template", icon: editTemplateIcon.trim() }
            : t
        )
      );
      setEditingTemplateId(null);
    } catch {
      // ignore
    }
  }

  async function handleDeleteTemplate(templateId: string) {
    try {
      await db.planningTemplates.delete(templateId);
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
      setItemsByTemplate((prev) => {
        const next = { ...prev };
        delete next[templateId];
        return next;
      });
      const remaining = templates.filter((t) => t.id !== templateId);
      if (remaining.length > 0) {
        setActiveTemplateId(remaining[0].id);
      } else {
        setActiveTemplateId(null);
      }
      setEditMode(false);
    } catch {
      // ignore
    }
  }

  async function handleAddTemplate() {
    const name = newTemplateName.trim();
    if (!name) return;
    try {
      const nextOrder = templates.length;
      const tpl = await db.planningTemplates.create(
        userId,
        name,
        newTemplateIcon.trim() || "📋",
        "custom",
        nextOrder,
        false
      );
      setTemplates((prev) => [...prev, tpl]);
      setItemsByTemplate((prev) => ({ ...prev, [tpl.id]: [] }));
      setActiveTemplateId(tpl.id);
      setAddingTemplate(false);
      setNewTemplateName("");
      setNewTemplateIcon("");
    } catch {
      // ignore
    }
  }

  function handleDragStart(itemId: string) {
    setDragItemId(itemId);
  }

  function handleDragOver(e: React.DragEvent, itemId: string) {
    e.preventDefault();
    setDragOverItemId(itemId);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverItemId(null);
    }
  }

  async function handleDrop(e: React.DragEvent, targetItemId: string) {
    e.preventDefault();
    setDragOverItemId(null);
    if (!dragItemId || dragItemId === targetItemId || !activeTemplateId) {
      setDragItemId(null);
      return;
    }
    const items = [...activeItems];
    const fromIdx = items.findIndex((i) => i.id === dragItemId);
    const toIdx = items.findIndex((i) => i.id === targetItemId);
    if (fromIdx === -1 || toIdx === -1) { setDragItemId(null); return; }
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    const reordered = items.map((item, idx) => ({ ...item, sort_order: idx }));
    setItemsByTemplate((prev) => ({ ...prev, [activeTemplateId]: reordered }));
    setDragItemId(null);
    try {
      await db.templateChecklistItems.reorder(reordered.map(({ id, sort_order }) => ({ id, sort_order })));
    } catch {
      // ignore
    }
  }

  return (
    <div className="template-sticky-panel" ref={panelRef}>
      <div className="template-sticky-header">
        <span className="template-sticky-title">Planning Templates</span>
        <div className="template-sticky-header-actions">
          {editMode && activeTemplate && (
            <button
              className="template-icon-btn template-icon-btn--danger"
              onClick={() => handleDeleteTemplate(activeTemplate.id)}
              title="Delete this template"
              disabled={activeTemplate.is_default}
            >
              🗑
            </button>
          )}
          <button
            className={`template-icon-btn ${editMode ? "template-icon-btn--active" : ""}`}
            onClick={() => {
              setEditMode((e) => !e);
              setAddingItem(false);
              setNewItemLabel("");
              setEditingTemplateId(null);
            }}
            title={editMode ? "Done editing" : "Edit template"}
          >
            {editMode ? "Done" : "✏️"}
          </button>
          <button className="template-icon-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
      </div>

      <div className="template-tab-row">
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            className={`template-tab-btn ${tpl.id === activeTemplateId ? "template-tab-btn--active" : ""}`}
            onClick={() => handleTabClick(tpl.id)}
          >
            {tpl.icon && <span className="template-tab-icon">{tpl.icon}</span>}
            {editMode && editingTemplateId === tpl.id ? (
              <input
                className="template-inline-input"
                value={editTemplateName}
                onChange={(e) => setEditTemplateName(e.target.value)}
                onBlur={handleSaveTemplateMeta}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveTemplateMeta(); }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                onDoubleClick={() => {
                  if (editMode) {
                    setEditingTemplateId(tpl.id);
                    setEditTemplateName(tpl.name);
                    setEditTemplateIcon(tpl.icon);
                  }
                }}
              >
                {tpl.name}
              </span>
            )}
          </button>
        ))}
        {addingTemplate ? (
          <div className="template-new-tpl-row">
            <input
              className="template-inline-input"
              placeholder="Icon"
              value={newTemplateIcon}
              onChange={(e) => setNewTemplateIcon(e.target.value)}
              style={{ width: 32 }}
              autoFocus
            />
            <input
              className="template-inline-input"
              placeholder="Name"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddTemplate(); if (e.key === "Escape") setAddingTemplate(false); }}
              style={{ flex: 1 }}
            />
            <button className="template-icon-btn" onClick={handleAddTemplate}>+</button>
            <button className="template-icon-btn" onClick={() => { setAddingTemplate(false); setNewTemplateName(""); setNewTemplateIcon(""); }}>✕</button>
          </div>
        ) : (
          <button className="template-tab-add-btn" onClick={() => setAddingTemplate(true)} title="Add template">+</button>
        )}
      </div>

      <div className="template-checklist">
        {activeItems.length === 0 && !addingItem && (
          <p className="template-empty-msg">No items yet. {editMode ? 'Add one below.' : 'Click ✏️ to edit.'}</p>
        )}
        {activeItems.map((item) => {
          const done = completedItemIds.has(item.id);
          const isDragging = dragItemId === item.id;
          const isDragOver = dragOverItemId === item.id;
          return (
            <div
              key={item.id}
              className={`template-checklist-item ${done ? "template-checklist-item--done" : ""} ${isDragging ? "template-checklist-item--dragging" : ""} ${isDragOver ? "template-checklist-item--dragover" : ""}`}
              draggable={editMode}
              onDragStart={() => handleDragStart(item.id)}
              onDragOver={(e) => handleDragOver(e, item.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, item.id)}
              onDragEnd={() => { setDragItemId(null); setDragOverItemId(null); }}
            >
              {editMode && (
                <span className="template-drag-handle" title="Drag to reorder">⠿</span>
              )}
              <button
                className={`template-checkbox ${done ? "template-checkbox--checked" : ""}`}
                onClick={() => handleToggleCompletion(item.id)}
                aria-label={done ? "Mark incomplete" : "Mark complete"}
              >
                {done && <span>✓</span>}
              </button>
              {editMode ? (
                <input
                  className="template-item-edit-input"
                  defaultValue={item.label}
                  onBlur={(e) => handleUpdateItemLabel(item.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleUpdateItemLabel(item.id, (e.target as HTMLInputElement).value);
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                />
              ) : (
                <span className={`template-item-label ${done ? "template-item-label--done" : ""}`}>{item.label}</span>
              )}
              {editMode && (
                <button
                  className="template-icon-btn template-icon-btn--danger template-delete-item-btn"
                  onClick={() => handleDeleteItem(item.id)}
                  title="Delete item"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}

        {editMode && (
          <div className="template-add-item-row">
            {addingItem ? (
              <>
                <input
                  ref={newItemInputRef}
                  className="template-new-item-input"
                  placeholder="New item..."
                  value={newItemLabel}
                  onChange={(e) => setNewItemLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddItem();
                    if (e.key === "Escape") { setAddingItem(false); setNewItemLabel(""); }
                  }}
                  autoFocus
                />
                <button className="template-icon-btn" onClick={handleAddItem} title="Add">+</button>
                <button className="template-icon-btn" onClick={() => { setAddingItem(false); setNewItemLabel(""); }} title="Cancel">✕</button>
              </>
            ) : (
              <button
                className="template-add-item-btn"
                onClick={() => setAddingItem(true)}
              >
                + Add item
              </button>
            )}
          </div>
        )}
      </div>

      {activeTemplate && (
        <div className="template-sticky-footer">
          <span className="template-sticky-footer-text">
            {activeTemplate.type === "weekly"
              ? "Resets each Monday"
              : activeTemplate.type === "daily"
              ? "Resets each day"
              : "Custom template"}
          </span>
          <span className="template-progress">
            {activeItems.filter((i) => completedItemIds.has(i.id)).length}/{activeItems.length} done
          </span>
        </div>
      )}
    </div>
  );
}
