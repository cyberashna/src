import { useEffect, useMemo, useRef, useState } from "react";

type OutlineNode = {
  id: string;
  text: string;
  collapsed: boolean;
  children: OutlineNode[];
};

type Props = {
  userId: string;
  onClose: () => void;
};

const storageKey = (userId: string) => `planning-outliner:${userId}`;

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createNode = (text = "New note"): OutlineNode => ({
  id: createId("outline"),
  text,
  collapsed: false,
  children: [],
});

const defaultNodes = (): OutlineNode[] => {
  const weeklyRdl = createNode("Weekly RDL");
  const rdl = { ...createNode("RDL"), children: [weeklyRdl] };
  const gluteusMaximus = { ...createNode("Gluteus Maximus"), children: [rdl] };
  const glute = { ...createNode("Glute"), children: [gluteusMaximus] };
  const exerciseRoutine = createNode("Exercise routine");
  const exercise = { ...createNode("Exercise"), children: [glute, exerciseRoutine] };
  return [{ ...createNode("Look good"), children: [exercise] }];
};

const cloneNodes = (nodes: OutlineNode[]): OutlineNode[] =>
  nodes.map((node) => ({ ...node, children: cloneNodes(node.children) }));

const loadNodes = (userId: string): OutlineNode[] => {
  try {
    const saved = localStorage.getItem(storageKey(userId));
    if (!saved) return defaultNodes();
    const parsed = JSON.parse(saved) as OutlineNode[];
    return Array.isArray(parsed) ? parsed : defaultNodes();
  } catch {
    return defaultNodes();
  }
};

const saveNodes = (userId: string, nodes: OutlineNode[]) => {
  localStorage.setItem(storageKey(userId), JSON.stringify(nodes));
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

function updateNode(
  nodes: OutlineNode[],
  id: string,
  updater: (node: OutlineNode) => OutlineNode
): OutlineNode[] {
  return nodes.map((node) => {
    if (node.id === id) return updater(node);
    return { ...node, children: updateNode(node.children, id, updater) };
  });
}

function addChild(nodes: OutlineNode[], parentId: string, child: OutlineNode): OutlineNode[] {
  return updateNode(nodes, parentId, (node) => ({
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

export default function PlanningOutlinerPanel({ userId, onClose }: Props) {
  const [nodes, setNodes] = useState<OutlineNode[]>(() => loadNodes(userId));
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [pendingFocusNodeId, setPendingFocusNodeId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    setNodes(loadNodes(userId));
    setFocusNodeId(null);
  }, [userId]);

  useEffect(() => {
    saveNodes(userId, nodes);
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

  const visibleCount = useMemo(() => {
    const count = (items: OutlineNode[]): number =>
      items.reduce((total, item) => total + 1 + count(item.children), 0);
    return count(visibleNodes);
  }, [visibleNodes]);

  const updateAndSave = (updater: (current: OutlineNode[]) => OutlineNode[]) => {
    setNodes((current) => updater(cloneNodes(current)));
  };

  const addRootOrFocusedChild = () => {
    const node = createNode();
    updateAndSave((current) =>
      focusNode ? addChild(current, focusNode.id, node) : [...current, node]
    );
    setPendingFocusNodeId(node.id);
  };

  const addChildWithFocus = (parentId: string) => {
    const node = createNode("New detail");
    updateAndSave((current) => addChild(current, parentId, node));
    setPendingFocusNodeId(node.id);
  };

  const addSiblingWithFocus = (siblingId: string) => {
    const node = createNode("New next");
    updateAndSave((current) => addSibling(current, siblingId, node));
    setPendingFocusNodeId(node.id);
  };

  const deleteAndRecoverFocus = (id: string) => {
    updateAndSave((current) => deleteNode(current, id));
    if (focusNodeId === id || focusPath.some((node) => node.id === id)) {
      setFocusNodeId(null);
    }
  };

  const renderRows = (items: OutlineNode[], depth = 0): JSX.Element[] =>
    items.map((node) => {
      const hasChildren = node.children.length > 0;
      return (
        <div key={node.id} className="outliner-row-wrap">
          <div className="outliner-row" style={{ paddingLeft: `${depth * 18 + 8}px` }}>
            <button
              type="button"
              className={`outliner-collapse ${hasChildren ? "" : "outliner-collapse--empty"}`}
              onClick={() => {
                if (!hasChildren) return;
                updateAndSave((current) =>
                  updateNode(current, node.id, (item) => ({ ...item, collapsed: !item.collapsed }))
                );
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
              onChange={(event) =>
                updateAndSave((current) =>
                  updateNode(current, node.id, (item) => ({ ...item, text: event.target.value }))
                )
              }
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (event.shiftKey) addChildWithFocus(node.id);
                else addSiblingWithFocus(node.id);
              }}
              placeholder="Planning note..."
            />
            <div className="outliner-row-actions">
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
