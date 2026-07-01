import { useEffect, useMemo, useRef, useState } from "react";
import {
  cloneOutlineNodes,
  createOutlineNode,
  loadPlanningOutliner,
  savePlanningOutliner,
  updateOutlineNode,
  type OutlineLink,
  type OutlineFrequency,
  type OutlineReminderKind,
  type OutlineNode,
} from "../services/planningOutliner";

type ThemeOption = {
  id: string;
  name: string;
  habits: Array<{ id: string; name: string }>;
};

type HabitLinkResult = {
  habitId: string;
  themeId: string;
  blockId?: string;
  linkedExisting?: boolean;
};

type ThemeLinkResult = {
  themeId: string;
  linkedExisting?: boolean;
  habitLinks: Array<{ nodeId: string; habitId: string }>;
};

type LinkedNoteResult = {
  content: string;
  updatedAt?: string;
};

type LinkedNoteState = {
  content: string;
  loading: boolean;
  saving: boolean;
  saved: boolean;
  updatedAt?: string;
};

type AttachTarget = {
  value: string;
  label: string;
  link: OutlineLink;
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
  ) => Promise<HabitLinkResult | null>;
  onCreateHabitBlock: (
    themeId: string,
    name: string,
    targetPerWeek: number,
    frequency: OutlineFrequency
  ) => Promise<HabitLinkResult | null>;
  onCreateThemeFromRow: (
    name: string,
    habits: Array<{ nodeId: string; name: string; target: number; frequency: OutlineFrequency }>
  ) => Promise<ThemeLinkResult | null>;
  onAddBoardForLinkedHabit: (link: OutlineLink) => Promise<HabitLinkResult | null>;
  onOpenLinked: (link: OutlineLink) => void;
  onRenameLinked: (link: OutlineLink, nextName: string) => Promise<boolean>;
  onLoadLinkedNote: (link: OutlineLink) => Promise<LinkedNoteResult>;
  onSaveLinkedNote: (link: OutlineLink, content: string) => Promise<LinkedNoteResult | null>;
  boardHabitIds: string[];
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

function removeNodeById(
  nodes: OutlineNode[],
  id: string
): { nodes: OutlineNode[]; removed: OutlineNode | null } {
  const nextNodes: OutlineNode[] = [];
  let removed: OutlineNode | null = null;

  for (const node of nodes) {
    if (node.id === id) {
      removed = node;
      continue;
    }

    const childResult = removeNodeById(node.children, id);
    if (childResult.removed) {
      removed = childResult.removed;
      nextNodes.push({ ...node, children: childResult.nodes });
    } else {
      nextNodes.push(node);
    }
  }

  return { nodes: nextNodes, removed };
}

function insertNodeBefore(
  nodes: OutlineNode[],
  targetId: string,
  nodeToInsert: OutlineNode
): { nodes: OutlineNode[]; inserted: boolean } {
  const nextNodes: OutlineNode[] = [];
  let inserted = false;

  for (const node of nodes) {
    if (node.id === targetId) {
      nextNodes.push(nodeToInsert);
      inserted = true;
    }

    if (inserted) {
      nextNodes.push(node);
      continue;
    }

    const childResult = insertNodeBefore(node.children, targetId, nodeToInsert);
    inserted = childResult.inserted;
    nextNodes.push(inserted ? { ...node, children: childResult.nodes } : node);
  }

  return { nodes: nextNodes, inserted };
}

function insertNodeAfter(
  nodes: OutlineNode[],
  targetId: string,
  nodeToInsert: OutlineNode
): { nodes: OutlineNode[]; inserted: boolean } {
  const nextNodes: OutlineNode[] = [];
  let inserted = false;

  for (const node of nodes) {
    nextNodes.push(node);
    if (node.id === targetId) {
      nextNodes.push(nodeToInsert);
      inserted = true;
      continue;
    }

    if (inserted) continue;

    const childResult = insertNodeAfter(node.children, targetId, nodeToInsert);
    inserted = childResult.inserted;
    if (inserted) nextNodes[nextNodes.length - 1] = { ...node, children: childResult.nodes };
  }

  return { nodes: nextNodes, inserted };
}

function moveNodeRelative(
  nodes: OutlineNode[],
  draggedId: string,
  targetId: string,
  position: "before" | "after"
): OutlineNode[] {
  if (draggedId === targetId) return nodes;
  const removeResult = removeNodeById(nodes, draggedId);
  if (!removeResult.removed) return nodes;

  const insertResult =
    position === "before"
      ? insertNodeBefore(removeResult.nodes, targetId, removeResult.removed)
      : insertNodeAfter(removeResult.nodes, targetId, removeResult.removed);
  return insertResult.inserted ? insertResult.nodes : nodes;
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

function formatNoteTimestamp(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const peskyIntervalOptions = [
  { value: 15, label: "Every 15 min" },
  { value: 60, label: "Hourly" },
  { value: 1440, label: "Daily" },
  { value: 10080, label: "Weekly" },
];

export default function PlanningOutlinerPanel({
  userId,
  onClose,
  themes,
  onCreateBlock,
  onCreateHabit,
  onCreateHabitBlock,
  onCreateThemeFromRow,
  onAddBoardForLinkedHabit,
  onOpenLinked,
  onRenameLinked,
  onLoadLinkedNote,
  onSaveLinkedNote,
  boardHabitIds,
}: Props) {
  const [nodes, setNodes] = useState<OutlineNode[]>([]);
  const [nodesLoaded, setNodesLoaded] = useState(false);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [pendingFocusNodeId, setPendingFocusNodeId] = useState<string | null>(null);
  const [habitConvertNodeId, setHabitConvertNodeId] = useState<string | null>(null);
  const [reminderNodeId, setReminderNodeId] = useState<string | null>(null);
  const [reminderValue, setReminderValue] = useState("");
  const [reminderKind, setReminderKind] = useState<OutlineReminderKind>("regular");
  const [reminderIntervalMinutes, setReminderIntervalMinutes] = useState(1440);
  const [noteNodeId, setNoteNodeId] = useState<string | null>(null);
  const [linkedNotes, setLinkedNotes] = useState<Record<string, LinkedNoteState>>({});
  const [noteAttachTargets, setNoteAttachTargets] = useState<Record<string, string>>({});
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [actionMenuNodeId, setActionMenuNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedThemeId, setSelectedThemeId] = useState("");
  const noteSaveTimers = useRef<Record<string, number>>({});
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    setNodesLoaded(false);
    setFocusNodeId(null);
    loadPlanningOutliner(userId).then((loaded) => {
      setNodes(loaded);
      setNodesLoaded(true);
    });
  }, [userId]);

  useEffect(() => {
    if (!nodesLoaded) return;
    savePlanningOutliner(userId, nodes);
  }, [nodes, userId, nodesLoaded]);

  useEffect(() => {
    return () => {
      Object.values(noteSaveTimers.current).forEach(clearTimeout);
    };
  }, []);

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
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const selectedTheme = themes.find((theme) => theme.id === selectedThemeId) ?? themes[0];
  const boardHabitIdSet = useMemo(() => new Set(boardHabitIds), [boardHabitIds]);
  const attachTargets = useMemo<AttachTarget[]>(
    () =>
      themes.flatMap((theme) => [
        {
          value: `theme:${theme.id}`,
          label: `Theme: ${theme.name}`,
          link: { themeId: theme.id, label: theme.name, renameDeclinedFor: null },
        },
        ...theme.habits.map((habit) => ({
          value: `habit:${theme.id}:${habit.id}`,
          label: `Habit: ${theme.name} / ${habit.name}`,
          link: {
            habitId: habit.id,
            themeId: theme.id,
            label: habit.name,
            renameDeclinedFor: null,
          },
        })),
      ]),
    [themes]
  );

  const displayedNodes = useMemo(() => {
    if (!normalizedSearch) return visibleNodes;

    const nodeMatchesSearch = (node: OutlineNode) => {
      const linkedNote = linkedNotes[node.id]?.content ?? "";
      const searchable = [
        node.text,
        node.tag,
        node.frequency,
        node.linked?.label,
        node.linked?.habitId ? "linked habit" : "",
        node.linked?.themeId && !node.linked?.habitId ? "linked theme" : "",
        node.taskDone ? "done completed" : "",
        node.reminderAt ? formatReminder(node.reminderAt) : "",
        node.reminderKind,
        node.draftNote,
        linkedNote,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedSearch);
    };

    const filterNodes = (items: OutlineNode[]): OutlineNode[] =>
      items
        .map((node) => {
          const children = filterNodes(node.children);
          return nodeMatchesSearch(node) || children.length > 0 ? { ...node, children } : null;
        })
        .filter((node): node is OutlineNode => !!node);

    return filterNodes(visibleNodes);
  }, [visibleNodes, normalizedSearch, linkedNotes]);

  const visibleCount = useMemo(() => {
    const count = (items: OutlineNode[]): number =>
      items.reduce((total, item) => total + 1 + count(item.children), 0);
    return count(displayedNodes);
  }, [displayedNodes]);

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

  const setRowLink = (id: string, link: OutlineLink) => {
    updateAndSave((current) =>
      updateOutlineNode(current, id, (item) => ({
        ...item,
        linked: link,
      }))
    );
  };

  const mergeRowLink = (id: string, updates: Partial<OutlineLink>) => {
    updateAndSave((current) =>
      updateOutlineNode(current, id, (item) => ({
        ...item,
        linked: item.linked ? { ...item.linked, ...updates } : null,
      }))
    );
  };

  const applyHabitLink = (node: OutlineNode, result: HabitLinkResult) => {
    setRowLink(node.id, {
      habitId: result.habitId,
      themeId: result.themeId,
      blockId: result.blockId,
      label: node.text.trim(),
      renameDeclinedFor: null,
    });
  };

  const maybeSyncLinkedRename = async (node: OutlineNode) => {
    const label = node.text.trim();
    if (!label || !node.linked || node.linked.label === label) return;
    if (node.linked.renameDeclinedFor === label) return;
    const renamed = await onRenameLinked(node.linked, label);
    mergeRowLink(node.id, {
      label: renamed ? label : node.linked.label,
      renameDeclinedFor: renamed ? null : label,
    });
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
    const result = await onCreateHabit(selectedTheme.id, label, node.target, node.frequency);
    if (result) applyHabitLink(node, result);
    setHabitConvertNodeId(null);
  };

  const convertToHabitBlock = async (node: OutlineNode) => {
    const label = node.text.trim();
    if (!label || !selectedTheme) return;
    const result = await onCreateHabitBlock(selectedTheme.id, label, node.target, node.frequency);
    if (result) applyHabitLink(node, result);
    setHabitConvertNodeId(null);
  };

  const convertToTheme = async (node: OutlineNode) => {
    const label = node.text.trim();
    if (!label) return;
    const directHabits = node.children
      .filter((child) => child.tag === "habit" && child.text.trim())
      .map((child) => ({
        nodeId: child.id,
        name: child.text.trim(),
        target: child.target,
        frequency: child.frequency,
      }));
    const result = await onCreateThemeFromRow(label, directHabits);
    if (!result) return;

    updateAndSave((current) =>
      updateOutlineNode(current, node.id, (item) => ({
        ...item,
        linked: {
          themeId: result.themeId,
          label,
          renameDeclinedFor: null,
        },
        children: item.children.map((child) => {
          const childLink = result.habitLinks.find((habit) => habit.nodeId === child.id);
          if (!childLink) return child;
          return {
            ...child,
            linked: {
              habitId: childLink.habitId,
              themeId: result.themeId,
              label: child.text.trim(),
              renameDeclinedFor: null,
            },
          };
        }),
      }))
    );
  };

  const addBoardForLinkedHabit = async (node: OutlineNode) => {
    if (!node.linked?.habitId) return;
    const result = await onAddBoardForLinkedHabit(node.linked);
    if (result?.blockId) mergeRowLink(node.id, { blockId: result.blockId });
  };

  const openReminderPanel = (node: OutlineNode) => {
    setReminderNodeId((current) => current === node.id ? null : node.id);
    setReminderValue(toLocalDatetimeValue(node.reminderAt));
    setReminderKind(node.reminderKind);
    setReminderIntervalMinutes(node.reminderIntervalMinutes ?? 1440);
  };

  const saveReminder = (nodeId: string) => {
    if (!reminderValue) return;
    updateRow(nodeId, {
      reminderAt: new Date(reminderValue).toISOString(),
      reminderDismissedAt: null,
      reminderKind,
      reminderIntervalMinutes: reminderKind === "pesky" ? reminderIntervalMinutes : null,
    });
    setReminderNodeId(null);
  };

  const clearReminder = (nodeId: string) => {
    updateRow(nodeId, {
      reminderAt: null,
      reminderDismissedAt: null,
      reminderKind: "regular",
      reminderIntervalMinutes: null,
    });
    setReminderNodeId(null);
  };

  const openRowNote = async (node: OutlineNode) => {
    const willOpen = noteNodeId !== node.id;
    setNoteNodeId(willOpen ? node.id : null);
    if (!willOpen || linkedNotes[node.id]) return;

    setLinkedNotes((prev) => ({
      ...prev,
      [node.id]: { content: "", loading: true, saving: false, saved: false },
    }));

    if (!node.linked) {
      setLinkedNotes((prev) => ({
        ...prev,
        [node.id]: {
          content: node.draftNote,
          loading: false,
          saving: false,
          saved: false,
          updatedAt: node.draftNoteUpdatedAt ?? undefined,
        },
      }));
      setNoteAttachTargets((prev) => ({
        ...prev,
        [node.id]: prev[node.id] || attachTargets[0]?.value || "",
      }));
      return;
    }

    try {
      const result = await onLoadLinkedNote(node.linked);
      setLinkedNotes((prev) => ({
        ...prev,
        [node.id]: {
          content: result.content,
          loading: false,
          saving: false,
          saved: false,
          updatedAt: result.updatedAt,
        },
      }));
    } catch {
      setLinkedNotes((prev) => ({
        ...prev,
        [node.id]: { content: "", loading: false, saving: false, saved: false },
      }));
    }
  };

  const saveLinkedNote = async (node: OutlineNode, content: string) => {
    if (!node.linked) {
      const updatedAt = new Date().toISOString();
      updateRow(node.id, { draftNote: content, draftNoteUpdatedAt: updatedAt });
      setLinkedNotes((prev) => ({
        ...prev,
        [node.id]: {
          ...(prev[node.id] ?? { content }),
          content,
          loading: false,
          saving: false,
          saved: true,
          updatedAt,
        },
      }));
      window.setTimeout(() => {
        setLinkedNotes((prev) => ({
          ...prev,
          [node.id]: prev[node.id] ? { ...prev[node.id], saved: false } : prev[node.id],
        }));
      }, 1200);
      return;
    }

    setLinkedNotes((prev) => ({
      ...prev,
      [node.id]: { ...(prev[node.id] ?? { content: "" }), content, loading: false, saving: true, saved: false },
    }));

    const result = await onSaveLinkedNote(node.linked, content);
    setLinkedNotes((prev) => ({
      ...prev,
      [node.id]: {
        ...(prev[node.id] ?? { content }),
        content,
        loading: false,
        saving: false,
        saved: !!result,
        updatedAt: result?.updatedAt ?? prev[node.id]?.updatedAt,
      },
    }));
    window.setTimeout(() => {
      setLinkedNotes((prev) => ({
        ...prev,
        [node.id]: prev[node.id] ? { ...prev[node.id], saved: false } : prev[node.id],
      }));
    }, 1800);
  };

  const updateLinkedNote = (node: OutlineNode, content: string) => {
    setLinkedNotes((prev) => ({
      ...prev,
      [node.id]: {
        ...(prev[node.id] ?? { loading: false, saving: false, saved: false }),
        content,
      },
    }));

    if (noteSaveTimers.current[node.id]) clearTimeout(noteSaveTimers.current[node.id]);
    noteSaveTimers.current[node.id] = window.setTimeout(() => {
      saveLinkedNote(node, content);
    }, 800);
  };

  const attachDraftNote = async (node: OutlineNode) => {
    if (node.linked) return;
    const targetValue = noteAttachTargets[node.id] || attachTargets[0]?.value;
    const target = attachTargets.find((item) => item.value === targetValue);
    if (!target) return;

    window.clearTimeout(noteSaveTimers.current[node.id]);
    delete noteSaveTimers.current[node.id];

    const content = (linkedNotes[node.id]?.content ?? node.draftNote).trim();
    const title = node.text.trim() || "Outliner note";
    const detailNote = content ? `## ${title}\n${content}` : `## ${title}`;
    const existing = await onLoadLinkedNote(target.link);
    const merged = existing.content.trim()
      ? `${existing.content.trim()}\n\n${detailNote}`
      : detailNote;
    const saved = await onSaveLinkedNote(target.link, merged);
    if (!saved) return;

    setRowLink(node.id, {
      ...target.link,
      label: title,
      renameDeclinedFor: null,
    });
    setLinkedNotes((prev) => ({
      ...prev,
      [node.id]: {
        content: saved.content,
        loading: false,
        saving: false,
        saved: true,
        updatedAt: saved.updatedAt,
      },
    }));
  };

  const reorderRow = (
    draggedId: string | null,
    targetId: string,
    position: "before" | "after"
  ) => {
    if (!draggedId || draggedId === targetId) return;
    updateAndSave((current) => moveNodeRelative(current, draggedId, targetId, position));
    setDraggingNodeId(null);
    setDragOverNodeId(null);
  };

  const renderRows = (items: OutlineNode[], depth = 0, forceExpanded = false): JSX.Element[] =>
    items.map((node, index) => {
      const hasChildren = node.children.length > 0;
      const isHabitLinked = !!node.linked?.habitId;
      const isThemeLinked = !!node.linked?.themeId && !node.linked?.habitId;
      const isOnBoard = !!node.linked?.habitId && boardHabitIdSet.has(node.linked.habitId);
      const canMakeTheme = !node.linked && !!node.text.trim();
      const isDoneTask = node.tag === "task" && node.taskDone;
      const isDragTarget = dragOverNodeId === node.id && draggingNodeId !== node.id;
      const noteLabel = node.linked ? (node.linked.habitId ? "Habit note" : "Theme note") : "Draft note";
      const notePlaceholder = node.linked?.habitId
        ? "Write notes for this habit..."
        : node.linked?.themeId
        ? "Write notes for this theme..."
        : "Write a note here, then attach it to a habit or theme when you are ready...";
      return (
        <div key={node.id} className="outliner-row-wrap">
          <div
            className={`outliner-row ${isDragTarget ? "outliner-row--drag-over" : ""}`}
            style={{ paddingLeft: `${depth * 18 + 8}px` }}
            onDragOver={(event) => {
              if (!draggingNodeId || draggingNodeId === node.id) return;
              event.preventDefault();
              setDragOverNodeId(node.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const draggedId = draggingNodeId || event.dataTransfer.getData("text/plain");
              const bounds = event.currentTarget.getBoundingClientRect();
              const position = event.clientY > bounds.top + bounds.height / 2 ? "after" : "before";
              reorderRow(draggedId, node.id, position);
            }}
            onDragLeave={() => {
              setDragOverNodeId((current) => (current === node.id ? null : current));
            }}
          >
            <button
              type="button"
              className="outliner-drag-handle"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", node.id);
                setDraggingNodeId(node.id);
              }}
              onDragEnd={() => {
                setDraggingNodeId(null);
                setDragOverNodeId(null);
              }}
              title="Drag to reorder"
              aria-label="Drag to reorder row"
            >
              =
            </button>
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
            {node.tag === "task" ? (
              <button
                type="button"
                className={`outliner-task-check ${node.taskDone ? "outliner-task-check--done" : ""}`}
                onClick={() => updateRow(node.id, { taskDone: !node.taskDone })}
                title={node.taskDone ? "Mark task not done" : "Mark task done"}
                aria-label={node.taskDone ? "Mark task not done" : "Mark task done"}
              >
                {node.taskDone ? "✓" : ""}
              </button>
            ) : node.tag === "habit" ? (
              <button
                type="button"
                className="outliner-bullet"
                onClick={() => setFocusNodeId(node.id)}
                title="Focus this row"
                aria-label="Focus this row"
              />
            ) : (
              <span className="outliner-task-check-placeholder" />
            )}
            <input
              ref={(element) => {
                inputRefs.current[node.id] = element;
              }}
              className={`outliner-input ${isDoneTask ? "outliner-input--done" : ""}`}
              value={node.text}
              onChange={(event) => updateRow(node.id, { text: event.target.value })}
              onBlur={() => maybeSyncLinkedRename(node)}
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
            {(isThemeLinked || isHabitLinked || isOnBoard) && (
              <div className="outliner-link-pills">
                {isThemeLinked && <span>Linked theme</span>}
                {isHabitLinked && <span>Linked habit</span>}
                {isOnBoard && <span>On board</span>}
              </div>
            )}
            <div className="outliner-row-actions">
              <button
                type="button"
                onClick={() => openRowNote(node)}
                title={node.linked ? "Write in the same note shown in Habit Notes" : "Write a note and attach it later"}
              >
                Notes
              </button>
              {isHabitLinked && !isOnBoard && (
                <button
                  type="button"
                  onClick={() => addBoardForLinkedHabit(node)}
                  title="Add this linked habit to the board as an unscheduled habit block"
                >
                  Add board
                </button>
              )}
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
              {canMakeTheme && (
                <button
                  type="button"
                  onClick={() => convertToTheme(node)}
                  title="Create or link a theme from this row. Direct habit children come along."
                >
                  Make theme
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
              <div className="outliner-more-wrap">
                <button
                  type="button"
                  className={`outliner-more-btn ${actionMenuNodeId === node.id ? "outliner-more-btn--active" : ""}`}
                  onClick={() => setActionMenuNodeId((current) => (current === node.id ? null : node.id))}
                  title="More row actions"
                  aria-label="More row actions"
                >
                  ...
                </button>
                {actionMenuNodeId === node.id && (
                  <div className="outliner-action-menu">
                    {node.linked && (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenLinked(node.linked!);
                          setActionMenuNodeId(null);
                        }}
                      >
                        Open linked
                      </button>
                    )}
                    {isHabitLinked && !isOnBoard && (
                      <button
                        type="button"
                        onClick={() => {
                          addBoardForLinkedHabit(node);
                          setActionMenuNodeId(null);
                        }}
                      >
                        Add to board
                      </button>
                    )}
                    {node.tag === "task" && (
                      <button
                        type="button"
                        onClick={() => {
                          convertToBlock(node);
                          setActionMenuNodeId(null);
                        }}
                      >
                        Turn into block
                      </button>
                    )}
                    {node.tag === "habit" && (
                      <button
                        type="button"
                        onClick={() => {
                          setHabitConvertNodeId((current) => (current === node.id ? null : node.id));
                          setSelectedThemeId((current) => current || themes[0]?.id || "");
                          setActionMenuNodeId(null);
                        }}
                      >
                        Make real habit
                      </button>
                    )}
                    {canMakeTheme && (
                      <button
                        type="button"
                        onClick={() => {
                          convertToTheme(node);
                          setActionMenuNodeId(null);
                        }}
                      >
                        Make theme
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        openReminderPanel(node);
                        setActionMenuNodeId(null);
                      }}
                    >
                      Remind me
                    </button>
                    {!normalizedSearch && index > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          nestPreviousUnder(node.id);
                          setActionMenuNodeId(null);
                        }}
                      >
                        Nest previous row
                      </button>
                    )}
                    <button
                      type="button"
                      className="outliner-delete"
                      onClick={() => {
                        deleteAndRecoverFocus(node.id);
                        setActionMenuNodeId(null);
                      }}
                    >
                      Delete row
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          {node.reminderAt && (
            <div
              className={`outliner-reminder-pill ${node.reminderKind === "pesky" ? "outliner-reminder-pill--pesky" : ""}`}
              style={{ marginLeft: `${depth * 18 + 44}px` }}
            >
              {node.reminderKind === "pesky" ? "Pesky" : "Reminds"} {formatReminder(node.reminderAt)}
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
              <select
                value={reminderKind}
                onChange={(event) => {
                  const nextKind = event.target.value as OutlineReminderKind;
                  setReminderKind(nextKind);
                  if (nextKind === "pesky") setReminderIntervalMinutes((value) => value || 1440);
                }}
                title="Reminder type"
              >
                <option value="regular">Regular</option>
                <option value="pesky">Pesky</option>
              </select>
              {reminderKind === "pesky" && (
                <select
                  value={reminderIntervalMinutes}
                  onChange={(event) => setReminderIntervalMinutes(parseInt(event.target.value, 10))}
                  title="How often pesky reminders come back"
                >
                  {peskyIntervalOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
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
          {noteNodeId === node.id && (
            <div className="outliner-linked-note" style={{ marginLeft: `${depth * 18 + 44}px` }}>
              <span className="outliner-linked-note-dot" aria-hidden="true" />
              <div className="outliner-linked-note-content">
                <div className="outliner-linked-note-header">
                  <span>{noteLabel}</span>
                  {linkedNotes[node.id]?.loading && <em>Loading...</em>}
                  {linkedNotes[node.id]?.saving && <em>Saving...</em>}
                  {linkedNotes[node.id]?.saved && <em>Saved</em>}
                  {linkedNotes[node.id]?.updatedAt && !linkedNotes[node.id]?.saving && (
                    <em>Edited {formatNoteTimestamp(linkedNotes[node.id]?.updatedAt)}</em>
                  )}
                </div>
                <textarea
                  value={linkedNotes[node.id]?.content ?? ""}
                  onChange={(event) => updateLinkedNote(node, event.target.value)}
                  placeholder={notePlaceholder}
                  rows={3}
                />
                {!node.linked && (
                  <div className="outliner-note-attach">
                    <span>Attach to</span>
                    <select
                      value={noteAttachTargets[node.id] || attachTargets[0]?.value || ""}
                      onChange={(event) =>
                        setNoteAttachTargets((prev) => ({
                          ...prev,
                          [node.id]: event.target.value,
                        }))
                      }
                      disabled={attachTargets.length === 0}
                    >
                      {attachTargets.length === 0 ? (
                        <option value="">No themes yet</option>
                      ) : (
                        attachTargets.map((target) => (
                          <option key={target.value} value={target.value}>
                            {target.label}
                          </option>
                        ))
                      )}
                    </select>
                    <button
                      type="button"
                      onClick={() => attachDraftNote(node)}
                      disabled={attachTargets.length === 0}
                    >
                      Attach
                    </button>
                  </div>
                )}
              </div>
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
          {hasChildren && (forceExpanded || !node.collapsed) && renderRows(node.children, depth + 1, forceExpanded)}
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

      <div className="outliner-search-row">
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search rows, notes, tasks, habits, reminders..."
        />
        {searchQuery && (
          <button type="button" onClick={() => setSearchQuery("")}>
            Clear
          </button>
        )}
      </div>

      {focusNode && (
        <div className="outliner-focus-card">
          <span>Focused on</span>
          <strong>{focusNode.text.trim() || "Untitled"}</strong>
        </div>
      )}

      <div className="outliner-body">
        {displayedNodes.length === 0 ? (
          <div className="outliner-empty">
            {normalizedSearch ? "No matching rows." : "Add a row to start planning at this level."}
          </div>
        ) : (
          renderRows(displayedNodes, 0, !!normalizedSearch)
        )}
      </div>

      <div className="outliner-footer">
        <span>
          {visibleCount} row{visibleCount === 1 ? "" : "s"} {normalizedSearch ? "matching" : "in view"}
        </span>
        <button type="button" onClick={addRootOrFocusedChild}>
          + Add row here
        </button>
      </div>
    </div>
  );
}
