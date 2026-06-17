import { useEffect, useMemo, useRef, useState } from "react";
import {
  cloneOutlineNodes,
  createOutlineNode,
  loadPlanningOutliner,
  savePlanningOutliner,
  updateOutlineNode,
  type OutlineFrequency,
  type OutlineNode,
} from "../services/planningOutliner";

type ThemeOption = {
  id: string;
  name: string;
};

type Props = {
  userId: string;
  onClose: () => void;
  themes: ThemeOption[];
  onCreateBlock: (label: string) => Promise<void>;
  onCreateHabit: (
    themeId: string,
    name: string,
    targetPerWeek: number,
    frequency: OutlineFrequency
  ) => Promise<string | null>;
  onCreateHabitBlock: (
    themeId: string,
    name: string,
    targetPerWeek: number,
    frequency: OutlineFrequency
  ) => Promise<void>;
  onCreateThemeFromRow: (
    name: string,
    habits: Array<{ name: string; target: number; frequency: OutlineFrequency }>
  ) => Promise<void>;
};

function findNode(
  nodes: OutlineNode[],
  id: string,
  path: OutlineNode[] = []
): { node: OutlineNode; path: OutlineNode[] } | null {
  for (const node of nodes) {
    const nextPath = [...path, node];
    if (node.id === id) return { node, path: nextPath };
    const childResult = findNode(node.children, id, nextPath);
    if (childResult) return childResult;
  }
  return null;
}

function addChild(nodes: OutlineNode[], parentId: string, child: OutlineNode): OutlineNode[] {
  return updateOutlineNode(nodes, parentId, (node) => ({
    ...node,
    collapsed: false,
    children: [...node.children, child],
  }));
}

function addSibling(nodes: OutlineNode[], siblingId: string, sibling: OutlineNode): OutlineNode[] {
  const next: OutlineNode[] = [];
  for (const node of nodes) {
    next.push({
      ...node,
      children: addSibling(node.children, siblingId, sibling),
    });
    if (node.id === siblingId) {
      next.push(sibling);
    }
  }
  return next;
}

function deleteNode(nodes: OutlineNode[], id: string): OutlineNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({ ...node, children: deleteNode(node.children, id) }));
}

function nestPreviousSiblingUnder(nodes: OutlineNode[], targetId: string): OutlineNode[] {
  const targetIndex = nodes.findIndex((node) => node.id === targetId);

  if (targetIndex > 0) {
    const previousSibling = nodes[targetIndex - 1];
    const targetNode = nodes[targetIndex];
    return [
      ...nodes.slice(0, targetIndex - 1),
      {
        ...targetNode,
        collapsed: false,
        children: [previousSibling, ...targetNode.children],
      },
      ...nodes.slice(targetIndex + 1),
    ];
  }

  return nodes.map((node) => ({
    ...node,
    children: nestPreviousSiblingUnder(node.children, targetId),
  }));
}

function toLocalDatetimeValue(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatReminder(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PlanningOutlinerPanel({
  userId,
  onClose,
  themes,
  onCreateBlock,
  onCreateHabit,
  onCreateHabitBlock,
  onCreateThemeFromRow,
}: Props) {
  const [nodes, setNodes] = useState<OutlineNode[]>(() => loadPlanningOutliner(userId));
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [pendingFocusNodeId, setPendingFocusNodeId] = useState<string | null>(null);
  const [habitConvertNodeId, setHabitConvertNodeId] = useState<string | null>(null);
  const [reminderNodeId, setReminderNodeId] = useState<string | null>(null);
  const [reminderValue, setReminderValue] = useState("");
  const [selectedThemeId, setSelectedThemeId] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    setNodes(loadPlanningOutliner(userId));
    setFocusNodeId(null);
  }, [userId]);

  useEffect(() => {
    savePlanningOutliner(userId, nodes);
  }, [nodes, userId]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    if (!pendingFocusNodeId) return;
    const input = inputRefs.current[pendingFocusNodeId];
    if (!input) return;
    input.focus();
    input.select();
    setPendingFocusNodeId(null);
  }, [nodes, pendingFocusNodeId]);

  const focusResult = focusNodeId ? findNode(nodes, focusNodeId) : null;
  const focusNode = focusResult?.node ?? null;
  const focusPath = focusResult?.path ?? [];
  const visibleNodes = focusNode ? focusNode.children : nodes;
  const selectedTheme = themes.find((theme) => theme.id === selectedThemeId) ?? themes[0];

  const visibleCount = useMemo(() => {
    const count = (items: OutlineNode[]): number =>
      items.reduce((total, item) => total + 1 + count(item.children), 0);
    return count(visibleNodes);
  }, [visibleNodes]);

  const updateAndSave = (updater: (current: OutlineNode[]) => OutlineNode[]) => {
    setNodes((current) => updater(cloneOutlineNodes(current)));
  };

  const updateRow = (id: string, updates: Partial<OutlineNode>) => {
    updateAndSave((current) =>
      updateOutlineNode(current, id, (item) => ({
        ...item,
        ...updates,
        target: Math.max(1, updates.target ?? item.target),
      }))
    );
  };

  const addRootOrFocusedChild = () => {
    const node = createOutlineNode();
    updateAndSave((current) =>
      focusNode ? addChild(current, focusNode.id, node) : [...current, node]
    );
    setPendingFocusNodeId(node.id);
  };

  const addChildWithFocus = (parentId: string) => {
    const node = createOutlineNode("New detail");
    updateAndSave((current) => addChild(current, parentId, node));
    setPendingFocusNodeId(node.id);
  };

  const addSiblingWithFocus = (siblingId: string) => {
    const node = createOutlineNode("New next");
    updateAndSave((current) => addSibling(current, siblingId, node));
    setPendingFocusNodeId(node.id);
  };

  const deleteAndRecoverFocus = (id: string) => {
    updateAndSave((current) => deleteNode(current, id));
    if (focusNodeId === id || focusPath.some((node) => node.id === id)) {
      setFocusNodeId(null);
    }
  };

  const nestPreviousUnder = (id: string) => {
    updateAndSave((current) => nestPreviousSiblingUnder(current, id));
  };

  const convertToBlock = async (node: OutlineNode) => {
    const label = node.text.trim();
    if (!label) return;
    await onCreateBlock(label);
  };

  const convertToHabit = async (node: OutlineNode) => {
    const label = node.text.trim();
    if (!label || !selectedTheme) return;
    await onCreateHabit(selectedTheme.id, label, node.target, node.frequency);
    setHabitConvertNodeId(null);
  };

  const convertToHabitBlock = async (node: OutlineNode) => {
    const label = node.text.trim();
    if (!label || !selectedTheme) return;
    await onCreateHabitBlock(selectedTheme.id, label, node.target, node.frequency);
    setHabitConvertNodeId(null);
  };

  const convertToTheme = async (node: OutlineNode) => {
    const label = node.text.trim();
    if (!label) return;
    const directHabits = node.children
      .filter((child) => child.tag === "habit" && child.text.trim())
      .map((child) => ({
        name: child.text.trim(),
        target: child.target,
        frequency: child.frequency,
      }));
    await onCreateThemeFromRow(label, directHabits);
  };

  const openReminderPanel = (node: OutlineNode) => {
    setReminderNodeId((current) => current === node.id ? null : node.id);
    setReminderValue(toLocalDatetimeValue(node.reminderAt));
  };

  const saveReminder = (nodeId: string) => {
    if (!reminderValue) return;
    updateRow(nodeId, {
      reminderAt: new Date(reminderValue).toISOString(),
      reminderDismissedAt: null,
    });
    setReminderNodeId(null);
  };

  const clearReminder = (nodeId: string) => {
    updateRow(nodeId, {
      reminderAt: null,
      reminderDismissedAt: null,
    });
    setReminderNodeId(null);
  };

  const renderRows = (items: OutlineNode[], depth = 0): JSX.Element[] =>
    items.map((node, index) => {
      const hasChildren = node.children.length > 0;
      return (
        <div key={node.id} className="outliner-row-wrap">
          <div className="outliner-row" style={{ paddingLeft: `${depth * 18 + 8}px` }}>
            <button
              type="button"
              className={`outliner-collapse ${hasChildren ? "" : "outliner-collapse--empty"}`}
              onClick={() => {
                if (!hasChildren) return;
                updateRow(node.id, { collapsed: !node.collapsed });
              }}
              aria-label={node.collapsed ? "Expand row" : "Collapse row"}
            >
              {hasChildren ? (node.collapsed ? ">" : "v") : ""}
            </button>
            <button
              type="button"
              className="outliner-bullet"
              onClick={() => setFocusNodeId(node.id)}
              title="Focus this row"
              aria-label="Focus this row"
            />
            <input
              ref={(element) => {
                inputRefs.current[node.id] = element;
              }}
              className="outliner-input"
              value={node.text}
              onChange={(event) => updateRow(node.id, { text: event.target.value })}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (event.shiftKey) addChildWithFocus(node.id);
                else addSiblingWithFocus(node.id);
              }}
              placeholder="Planning note..."
            />
            <select
              className={`outliner-tag-select outliner-tag-select--${node.tag}`}
              value={node.tag}
              onChange={(event) =>
                updateRow(node.id, { tag: event.target.value as OutlineNode["tag"] })
              }
              title="Tag this row"
            >
              <option value="note">Note</option>
              <option value="task">Task</option>
              <option value="habit">Habit</option>
            </select>
            <div className="outliner-row-actions">
              {node.tag === "task" && (
                <button
                  type="button"
                  onClick={() => convertToBlock(node)}
                  title="Turn this task row into an unscheduled block"
                >
                  To block
                </button>
              )}
              {node.tag === "habit" && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setHabitConvertNodeId((current) => current === node.id ? null : node.id);
                      setSelectedThemeId((current) => current || themes[0]?.id || "");
                    }}
                    title="Turn this habit row into a real habit or habit block"
                  >
                    Make real
                  </button>
                </>
              )}
              {node.children.some((child) => child.tag === "habit") && (
                <button
                  type="button"
                  onClick={() => convertToTheme(node)}
                  title="Create a theme from this row and add its direct habit children"
                >
                  To theme
                </button>
              )}
              <button type="button" onClick={() => openReminderPanel(node)}>
                Remind
              </button>
              <button
                type="button"
                onClick={() => addChildWithFocus(node.id)}
                title="Add detail under this row"
              >
                + Detail
              </button>
              <button
                type="button"
                onClick={() => addSiblingWithFocus(node.id)}
                title="Add row at the same level"
              >
                + Next
              </button>
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => nestPreviousUnder(node.id)}
                  title="Pull the previous row underneath this row"
                >
                  Nest prev
                </button>
              )}
              <button
                type="button"
                className="outliner-delete"
                onClick={() => deleteAndRecoverFocus(node.id)}
                title="Delete row"
              >
                x
              </button>
            </div>
          </div>
          {node.reminderAt && (
            <div className="outliner-reminder-pill" style={{ marginLeft: `${depth * 18 + 44}px` }}>
              Reminds {formatReminder(node.reminderAt)}
            </div>
          )}
          {reminderNodeId === node.id && (
            <div className="outliner-reminder-panel" style={{ marginLeft: `${depth * 18 + 44}px` }}>
              <span>Remind me</span>
              <input
                type="datetime-local"
                value={reminderValue}
                onChange={(event) => setReminderValue(event.target.value)}
              />
              <button type="button" onClick={() => saveReminder(node.id)}>
                Save
              </button>
              {node.reminderAt && (
                <button type="button" className="outliner-reminder-clear" onClick={() => clearReminder(node.id)}>
                  Clear
                </button>
              )}
            </div>
          )}
          {node.tag === "habit" && (
            <div className="outliner-habit-settings" style={{ marginLeft: `${depth * 18 + 44}px` }}>
              <span>Frequency</span>
              <select
                value={node.frequency}
                onChange={(event) =>
                  updateRow(node.id, { frequency: event.target.value as OutlineFrequency })
                }
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="none">No schedule</option>
              </select>
              {node.frequency !== "none" && (
                <input
                  type="number"
                  min={1}
                  value={node.target}
                  onChange={(event) =>
                    updateRow(node.id, { target: Number(event.target.value) || 1 })
                  }
                  aria-label="Target count"
                />
              )}
            </div>
          )}
          {habitConvertNodeId === node.id && (
            <div className="outliner-convert-panel" style={{ marginLeft: `${depth * 18 + 44}px` }}>
              {themes.length === 0 ? (
                <span>Create a theme first, then this can become a habit.</span>
              ) : (
                <>
                  <span>Theme</span>
                  <select
                    value={selectedTheme?.id ?? ""}
                    onChange={(event) => setSelectedThemeId(event.target.value)}
                  >
                    {themes.map((theme) => (
                      <option key={theme.id} value={theme.id}>
                        {theme.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => convertToHabit(node)}>
                    Create habit
                  </button>
                  <button type="button" onClick={() => convertToHabitBlock(node)}>
                    Habit + board
                  </button>
                </>
              )}
            </div>
          )}
          {hasChildren && !node.collapsed && renderRows(node.children, depth + 1)}
        </div>
      );
    });

  return (
    <div className="outliner-panel" ref={panelRef}>
      <div className="outliner-header">
        <div>
          <span className="outliner-title">Planning Outliner</span>
          <span className="outliner-subtitle">Nest ideas from broad to specific.</span>
        </div>
        <button className="outliner-header-btn" type="button" onClick={onClose} title="Close">
          x
        </button>
      </div>

      <div className="outliner-breadcrumbs">
        <button type="button" onClick={() => setFocusNodeId(null)}>
          All plans
        </button>
        {focusPath.map((node) => (
          <button key={node.id} type="button" onClick={() => setFocusNodeId(node.id)}>
            {node.text.trim() || "Untitled"}
          </button>
        ))}
      </div>

      {focusNode && (
        <div className="outliner-focus-card">
          <span>Focused on</span>
          <strong>{focusNode.text.trim() || "Untitled"}</strong>
        </div>
      )}

      <div className="outliner-body">
        {visibleNodes.length === 0 ? (
          <div className="outliner-empty">Add a row to start planning at this level.</div>
        ) : (
          renderRows(visibleNodes)
        )}
      </div>

      <div className="outliner-footer">
        <span>{visibleCount} row{visibleCount === 1 ? "" : "s"} in view</span>
        <button type="button" onClick={addRootOrFocusedChild}>
          + Add row here
        </button>
      </div>
    </div>
  );
}
