import type { DiagnosticTarget } from '@archcode/core';
import {
  computeGroupBoxes,
  routeEdges,
  type Box,
  type GroupBoxResult,
  type Point,
} from '@archcode/core/canvas';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type FinalConnectionState,
  type NodeChange,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store';
import type { CanvasData } from '../worker/api';
import { ArrowMarkers, EdgeView, type ArchEdgeType } from './EdgeView';
import { ComponentNode, GroupNode, type ComponentNodeType, type GroupNodeType } from './nodes';
import { Palette, PALETTE_MIME } from './Palette';
import { setRoutes } from './routes';
import { deleteSelection } from './actions';
import { suggestRelationshipType } from './suggest';

const nodeTypes = { component: ComponentNode, group: GroupNode };
const edgeTypes = { arch: EdgeView };
const SNAP: [number, number] = [10, 10];

const cid = (id: string) => `c:${id}`;
const gid = (id: string) => `g:${id}`;

/** Từ spike ELK: view lớn hơn ngưỡng này khó đọc → gợi ý tách view. */
const LARGE_VIEW = 150;

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

function boxOf(n: ComponentNodeType): Box {
  return { x: n.position.x, y: n.position.y, width: n.data.node.width, height: n.data.node.height };
}

function toComponentNodes(
  canvas: CanvasData,
  prev: ComponentNodeType[],
  selected: Set<string>,
  readOnly: boolean,
): ComponentNodeType[] {
  const before = new Map(prev.map((n) => [n.id, n]));
  return canvas.nodes.map((node) => {
    const id = cid(node.id);
    const old = before.get(id);
    return {
      id,
      type: 'component',
      position: { x: node.x, y: node.y },
      width: node.width,
      height: node.height,
      data: { node },
      selected: selected.has(id) || (old?.selected ?? false),
      draggable: !readOnly,
      connectable: !readOnly,
      zIndex: 1,
    };
  });
}

/** Group trong cùng view sâu nhất chứa điểm `p`. */
function groupAt(boxes: Map<string, GroupBoxResult>, p: Point): string | undefined {
  let best: [string, GroupBoxResult] | undefined;
  for (const entry of boxes) {
    const b = entry[1];
    if (
      p.x >= b.x &&
      p.x <= b.x + b.width &&
      p.y >= b.y &&
      p.y <= b.y + b.height &&
      (!best || b.depth > best[1].depth)
    ) {
      best = entry;
    }
  }
  return best?.[0];
}

function CanvasInner() {
  const canvas = useApp((s) => s.canvas);
  const viewId = useApp((s) => s.viewId);
  const stale = useApp((s) => s.stale);
  const nodeCount = useApp((s) => s.nodeCount);
  const selection = useApp((s) => s.selection);
  const focus = useApp((s) => s.focus);
  const docVersion = useApp((s) => s.docVersion);
  const rf = useReactFlow();

  const [components, setComponents] = useState<ComponentNodeType[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [selectedEdges, setSelectedEdges] = useState<Set<string>>(new Set());
  /** Khung group cố định trong lúc kéo node: kéo ra ngoài viền là rời group (S5-LAYOUT-08). */
  const [frozen, setFrozenState] = useState<Map<string, GroupBoxResult> | null>(null);
  const frozenRef = useRef<Map<string, GroupBoxResult> | null>(null);
  const setFrozen = (boxes: Map<string, GroupBoxResult> | null) => {
    frozenRef.current = boxes;
    setFrozenState(boxes);
  };
  const dragging = useRef(false);
  const pendingCanvas = useRef<CanvasData | null>(null);
  const groupDrag = useRef<{ id: string; start: Point; nodes: Map<string, Point> } | null>(null);
  const fittedFor = useRef<string | null>(null);
  const expectNode = useRef<string | null>(null);
  const readOnly = stale;

  const selectionKey = selection
    ? selection.kind === 'component'
      ? cid(selection.id)
      : selection.kind === 'group'
        ? gid(selection.id)
        : `e:${selection.id}`
    : null;

  // Kết quả phân tích mới → cập nhật node (giữ nguyên trạng thái chọn). Đang kéo thì hoãn lại.
  const applyCanvas = useCallback(
    (data: CanvasData) => {
      setComponents((prev) =>
        toComponentNodes(data, prev, new Set(selectionKey ? [selectionKey] : []), readOnly),
      );
    },
    [selectionKey, readOnly],
  );
  useEffect(() => {
    if (!canvas) return;
    if (dragging.current) {
      pendingCanvas.current = canvas;
      return;
    }
    applyCanvas(canvas);
    if (expectNode.current) {
      const id = expectNode.current;
      expectNode.current = null;
      if (!canvas.nodes.some((n) => n.id === id)) {
        useApp
          .getState()
          .notify(`Component "${id}" đã được thêm nhưng không thuộc view hiện tại`, 'info');
      }
    }
  }, [canvas]);

  useEffect(() => {
    setComponents((prev) =>
      prev.map((n) =>
        n.draggable === !readOnly ? n : { ...n, draggable: !readOnly, connectable: !readOnly },
      ),
    );
  }, [readOnly]);

  // Chọn từ ngoài canvas (con trỏ YAML, panel kiểm tra, tìm kiếm) → đánh dấu trên canvas.
  useEffect(() => {
    if (useApp.getState().selectionOrigin === 'canvas') return;
    setComponents((prev) =>
      prev.map((n) =>
        n.selected === (n.id === selectionKey) ? n : { ...n, selected: n.id === selectionKey },
      ),
    );
    setSelectedGroups(new Set(selectionKey?.startsWith('g:') ? [selectionKey] : []));
    setSelectedEdges(new Set(selectionKey?.startsWith('e:') ? [selectionKey] : []));
  }, [selectionKey]);

  // Group: khung bao quanh component con, tính lại khi node di chuyển (trừ lúc đang kéo node).
  const groupBoxes = useMemo(() => {
    if (!canvas) return new Map<string, GroupBoxResult>();
    return computeGroupBoxes(
      canvas.groups,
      components.map((n) => ({ group: n.data.node.group, box: boxOf(n) })),
    );
  }, [canvas, components]);
  const shownGroups = frozen ?? groupBoxes;

  const groupNodes = useMemo<GroupNodeType[]>(() => {
    if (!canvas) return [];
    return canvas.groups.flatMap((group) => {
      const box = shownGroups.get(group.id);
      if (!box) return [];
      const id = gid(group.id);
      return [
        {
          id,
          type: 'group' as const,
          position: { x: box.x, y: box.y },
          width: box.width,
          height: box.height,
          data: { group },
          selected: selectedGroups.has(id),
          draggable: !readOnly,
          connectable: false,
          zIndex: -10 + box.depth,
        },
      ];
    });
  }, [canvas, shownGroups, selectedGroups, readOnly]);

  const nodes = useMemo(() => [...groupNodes, ...components], [groupNodes, components]);

  const edges = useMemo<ArchEdgeType[]>(
    () =>
      (canvas?.edges ?? []).map((edge) => ({
        id: `e:${edge.id}`,
        type: 'arch' as const,
        source: cid(edge.from),
        target: cid(edge.to),
        sourceHandle: 's',
        targetHandle: 't',
        data: { edge },
        selected: selectedEdges.has(`e:${edge.id}`),
      })),
    [canvas, selectedEdges],
  );

  // Đường đi connector: router orthogonal của core, tính lại mỗi khi node di chuyển.
  useEffect(() => {
    if (!canvas) return;
    const boxes = new Map(components.map((n) => [n.data.node.id, boxOf(n)]));
    setRoutes(
      routeEdges(
        boxes,
        canvas.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, label: e.label })),
      ),
    );
  }, [canvas, components]);

  // Căn khung khi lần đầu hiển thị một view. View trống thì giữ nguyên góc nhìn: node kéo vào
  // phải nằm đúng chỗ thả, không bị căn lại.
  useEffect(() => {
    const key = `${docVersion}:${viewId}`;
    if (!canvas || fittedFor.current === key) return;
    fittedFor.current = key;
    if (canvas.nodes.length)
      requestAnimationFrame(() => void rf.fitView({ padding: 0.08, maxZoom: 1 }));
  }, [canvas, viewId, docVersion, rf]);

  // Tìm kiếm → căn giữa node.
  useEffect(() => {
    if (!focus) return;
    const node = components.find((n) => n.id === cid(focus.id));
    const group = groupNodes.find((n) => n.id === gid(focus.id));
    const target = node
      ? boxOf(node)
      : group
        ? { ...group.position, width: group.width!, height: group.height! }
        : null;
    if (!target) return;
    void rf.setCenter(target.x + target.width / 2, target.y + target.height / 2, {
      zoom: Math.max(rf.getZoom(), 0.9),
      duration: 300,
    });
  }, [focus, canvas]);

  const currentPositions = useCallback(
    (list: ComponentNodeType[]): Record<string, Point> =>
      Object.fromEntries(
        list.map((n) => [
          n.data.node.id,
          { x: Math.round(n.position.x), y: Math.round(n.position.y) },
        ]),
      ),
    [],
  );

  const onNodesChange = useCallback((changes: NodeChange<ComponentNodeType | GroupNodeType>[]) => {
    const componentChanges: NodeChange<ComponentNodeType>[] = [];
    for (const change of changes) {
      const id = 'id' in change ? change.id : '';
      if (id.startsWith('g:')) {
        if (change.type === 'select') {
          setSelectedGroups((prev) => {
            const next = new Set(prev);
            if (change.selected) next.add(id);
            else next.delete(id);
            return next;
          });
        } else if (change.type === 'position' && change.position && groupDrag.current?.id === id) {
          // Kéo group = kéo mọi component bên trong.
          const drag = groupDrag.current;
          const dx = change.position.x - drag.start.x;
          const dy = change.position.y - drag.start.y;
          setComponents((prev) =>
            prev.map((n) => {
              const start = drag.nodes.get(n.id);
              return start ? { ...n, position: { x: start.x + dx, y: start.y + dy } } : n;
            }),
          );
        }
        continue;
      }
      componentChanges.push(change as NodeChange<ComponentNodeType>);
    }
    if (componentChanges.length) setComponents((prev) => applyNodeChanges(componentChanges, prev));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<ArchEdgeType>[]) => {
    setSelectedEdges((prev) => {
      let next = prev;
      for (const change of changes) {
        if (change.type !== 'select') continue;
        if (next === prev) next = new Set(prev);
        if (change.selected) next.add(change.id);
        else next.delete(change.id);
      }
      return next;
    });
  }, []);

  const onSelectionChange = useCallback(
    ({ nodes: selNodes, edges: selEdges }: OnSelectionChangeParams) => {
      const state = useApp.getState();
      const ids = selNodes.filter((n) => n.id.startsWith('c:')).map((n) => n.id.slice(2));
      state.setMultiSelection(ids);
      const all = [...selNodes.map((n) => n.id), ...selEdges.map((e) => e.id)];
      if (all.length === 1) state.select(targetOf(all[0]!), 'canvas');
      else if (all.length === 0 && state.selectionOrigin === 'canvas') state.select(null, 'canvas');
    },
    [],
  );

  const reveal = (target: DiagnosticTarget) => {
    const { model, revealLine } = useApp.getState();
    const list =
      target.kind === 'component'
        ? model?.components
        : target.kind === 'group'
          ? model?.groups
          : model?.relationships;
    const source = (
      list as { id: string; source?: { line: number; column: number } }[] | undefined
    )?.find((el) => el.id === target.id)?.source;
    if (source) revealLine(source.line, source.column, false);
  };

  const componentsRef = useRef(components);
  componentsRef.current = components;

  const onNodeDragStart = useCallback(
    (_: unknown, node: ComponentNodeType | GroupNodeType) => {
      dragging.current = true;
      if (node.type === 'group') {
        const groupId = node.id.slice(2);
        const parents = new Map(canvas?.groups.map((x) => [x.id, x.parent]));
        const inGroup = (g: string | undefined) => {
          const seen = new Set<string>();
          for (; g && !seen.has(g); g = parents.get(g)) {
            if (g === groupId) return true;
            seen.add(g);
          }
          return false;
        };
        const inside = componentsRef.current.filter((n) => inGroup(n.data.node.group));
        groupDrag.current = {
          id: node.id,
          start: node.position,
          nodes: new Map(inside.map((n) => [n.id, n.position])),
        };
      } else {
        setFrozen(groupBoxes);
      }
    },
    [canvas, groupBoxes],
  );

  const onNodeDragStop = useCallback(
    (
      _: unknown,
      node: ComponentNodeType | GroupNodeType,
      dragged: (ComponentNodeType | GroupNodeType)[],
    ) => {
      dragging.current = false;
      const boxes = frozenRef.current;
      const drag = groupDrag.current;
      setFrozen(null);
      groupDrag.current = null;

      // Vị trí cuối cùng lấy từ tham số của sự kiện (state của React có thể chưa kịp cập nhật).
      const overrides = new Map<string, Point>();
      for (const d of dragged) if (d.type === 'component') overrides.set(d.id, d.position);
      if (node.type === 'group' && drag) {
        const dx = node.position.x - drag.start.x;
        const dy = node.position.y - drag.start.y;
        for (const [id, p] of drag.nodes) overrides.set(id, { x: p.x + dx, y: p.y + dy });
      }
      const list = componentsRef.current.map((n) => {
        const p = overrides.get(n.id);
        return p ? { ...n, position: p } : n;
      });
      setComponents(list);

      if (viewId) {
        const state = useApp.getState();
        const positions = currentPositions(list);
        const moved =
          node.type === 'component' && dragged.length === 1
            ? list.find((n) => n.id === node.id)
            : undefined;
        const center = moved && {
          x: moved.position.x + moved.data.node.width / 2,
          y: moved.position.y + moved.data.node.height / 2,
        };
        const target = boxes && center ? groupAt(boxes, center) : undefined;
        if (moved && boxes && target !== moved.data.node.group) {
          // Kéo vào/ra group → đổi field `group` trong YAML + vị trí trong layout: một mục lịch sử.
          void state.dispatch(
            {
              type: 'updateField',
              target: { kind: 'component', id: moved.data.node.id },
              field: 'group',
              value: target ?? null,
            },
            { layout: (_r, layout) => withPositions(layout, viewId, positions) },
          );
        } else {
          state.commitPositions(viewId, positions);
        }
      }
      if (pendingCanvas.current) {
        const data = pendingCanvas.current;
        pendingCanvas.current = null;
        applyCanvas(data);
      }
    },
    [viewId, currentPositions, applyCanvas],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (
        !conn.source.startsWith('c:') ||
        !conn.target.startsWith('c:') ||
        conn.source === conn.target
      )
        return;
      const from = conn.source.slice(2);
      const to = conn.target.slice(2);
      const targetType = canvas?.nodes.find((n) => n.id === to)?.type;
      void useApp.getState().dispatch({
        type: 'addRelationship',
        relationship: { from, to, type: suggestRelationshipType(targetType) },
      });
    },
    [canvas],
  );

  // Thả connector lên thân node (không đúng handle) cũng nối được.
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid || !state.fromNode) return;
      const point = 'changedTouches' in event ? event.changedTouches[0]! : event;
      const el = document
        .elementFromPoint(point.clientX, point.clientY)
        ?.closest('.react-flow__node');
      const target = el?.getAttribute('data-id');
      if (!target?.startsWith('c:') || target === state.fromNode.id) return;
      onConnect({ source: state.fromNode.id, target, sourceHandle: null, targetHandle: null });
    },
    [onConnect],
  );

  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(PALETTE_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const onDrop = (e: React.DragEvent) => {
    const type = e.dataTransfer.getData(PALETTE_MIME);
    if (!type || readOnly || !viewId) return;
    e.preventDefault();
    e.stopPropagation();
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const group = groupAt(groupBoxes, p);
    const position = { x: Math.round(p.x - 80), y: Math.round(p.y - 32) };
    const positions = currentPositions(components);
    void useApp
      .getState()
      .dispatch(
        { type: 'addComponent', component: { type, group } },
        {
          layout: (result, layout) =>
            result.select
              ? withPositions(layout, viewId, { ...positions, [result.select.id]: position })
              : layout,
        },
      )
      .then((result) => {
        if (result?.ok && result.select) expectNode.current = result.select.id;
      });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (readOnly || (e.key !== 'Delete' && e.key !== 'Backspace')) return;
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable=true]'))
      return;
    e.preventDefault();
    void deleteSelection();
  };

  if (!canvas) {
    return (
      <div className="canvas-wrap" data-testid="canvas">
        <div className="placeholder">Diagram sẽ hiển thị khi YAML hợp lệ</div>
      </div>
    );
  }

  return (
    <div
      className="canvas-wrap"
      data-testid="canvas"
      onDragOver={onDragOver}
      onDrop={onDrop}
      onKeyDown={onKeyDown}
    >
      <ArrowMarkers />
      <Palette disabled={readOnly} />
      {readOnly && (
        <div className="banner warn canvas-banner" role="status">
          YAML đang lỗi cú pháp — canvas chỉ đọc, đang hiển thị bản hợp lệ gần nhất
        </div>
      )}
      {!readOnly && nodeCount > LARGE_VIEW && (
        <div className="banner info canvas-banner" role="status">
          View có {nodeCount} component — nên tách thành nhiều view nhỏ để dễ đọc
        </div>
      )}
      <ReactFlow<ComponentNodeType | GroupNodeType, ArchEdgeType>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={onSelectionChange}
        onNodeClick={(_, n) => reveal(targetOf(n.id))}
        onEdgeClick={(_, edge) => reveal(targetOf(edge.id))}
        onPaneClick={() => useApp.getState().select(null, 'canvas')}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={28}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        deleteKeyCode={null}
        snapToGrid
        snapGrid={SNAP}
        minZoom={0.1}
        maxZoom={4}
        elevateNodesOnSelect={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <MiniMap
          pannable
          zoomable
          className="minimap"
          nodeClassName={(n) => (n.type === 'group' ? 'mm-group' : 'mm-node')}
        />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function targetOf(rfId: string): DiagnosticTarget {
  const kind = rfId.startsWith('c:')
    ? 'component'
    : rfId.startsWith('g:')
      ? 'group'
      : 'relationship';
  return { kind, id: rfId.slice(2) };
}

function withPositions(
  layout: ReturnType<typeof useApp.getState>['layout'],
  viewId: string,
  positions: Record<string, Point>,
) {
  return {
    ...layout,
    views: {
      ...layout.views,
      [viewId]: {
        nodes: { ...layout.views[viewId]?.nodes, ...positions },
        edges: layout.views[viewId]?.edges ?? {},
      },
    },
  };
}
