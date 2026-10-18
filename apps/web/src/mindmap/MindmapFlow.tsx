import type { MindmapModel, Severity } from '@archcode/core';
import {
  layoutMindmap,
  mindBranchClass,
  mindBranchPath,
  mindLinkGeometry,
  mindNodeBodySvg,
  mindNodeClass,
  mindNodeTooltip,
  mindSeverityByBox,
  type MindBox,
  type MindmapLayout,
} from '@archcode/core/canvas';
import {
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import {
  createContext,
  memo,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useApp } from '../store';
import { easeOutCubic, frameAt, keyLayout, planTransition, type Placed } from './animate';
import { expandToDepth, findMindNode, isCollapsed, maxDepth, setAll } from './collapse';
import { navigate, type NavKey } from './navigate';

const DURATION_MS = 280;
const FIT_VIEW = { padding: 0.08, maxZoom: 1 } as const;
const MARKER_ID = 'mind-flow-arrow';

interface MindNodeData extends Record<string, unknown> {
  box: MindBox;
  className: string;
  body: string;
  tooltip: string;
  collapsed: boolean;
}
type MindNodeType = Node<MindNodeData, 'mind'>;

type MindBranchEdgeType = Edge<{ d: string; className: string; opacity: number }, 'mindBranch'>;
type MindLinkEdgeType = Edge<{ d: string; label?: string; lx: number; ly: number }, 'mindLink'>;

/** Bấm nút mở/đóng: node đó được giữ đứng yên trên màn hình. */
const ToggleContext = createContext<(id: string) => void>(() => {});

const MindNodeView = memo(function MindNodeView({ data, id }: NodeProps<MindNodeType>) {
  const toggle = useContext(ToggleContext);
  const { box } = data;
  // Nút nằm ngoài mép phía ngọn cây, ngang điểm neo của nhánh.
  const outward = box.side === 'left' ? 'left' : 'right';
  const cy = box.shape === 'box' ? box.height / 2 : box.height;
  return (
    <div
      // Lớp màu ở div để nút mở/đóng cũng dùng được biến `--mm` của nhánh.
      className={`mind-node${box.color ? ` ac-mm-c-${box.color}` : ''}`}
      title={data.tooltip}
      style={{ width: box.width, height: box.height }}
    >
      <svg width={box.width} height={box.height} aria-hidden>
        <g
          className={data.className}
          data-kind="mind-node"
          data-id={box.node.id}
          dangerouslySetInnerHTML={{ __html: data.body }}
        />
      </svg>
      {box.childCount > 0 && box.side !== 'root' && (
        <button
          type="button"
          className={`mind-toggle nodrag nopan ${outward}${data.collapsed ? ' collapsed' : ''}`}
          style={{ top: cy }}
          onClick={(e) => {
            e.stopPropagation();
            toggle(id);
          }}
          aria-expanded={!data.collapsed}
          aria-label={data.collapsed ? `Mở ${box.childCount} nhánh con` : 'Thu gọn nhánh'}
          data-testid="mind-toggle"
        >
          {data.collapsed ? box.childCount : outward === 'right' ? '‹' : '›'}
        </button>
      )}
      <Handle type="target" position={Position.Left} className="h-anchor" isConnectable={false} />
      <Handle type="source" position={Position.Right} className="h-anchor" isConnectable={false} />
    </div>
  );
});

function MindBranchEdge({ data }: EdgeProps<MindBranchEdgeType>) {
  return <path className={data!.className} d={data!.d} style={{ opacity: data!.opacity }} />;
}

function MindLinkEdge({ data, source, target }: EdgeProps<MindLinkEdgeType>) {
  return (
    <g className="ac-mm-link" data-kind="mind-link" data-from={source} data-to={target}>
      <path d={data!.d} markerEnd={`url(#${MARKER_ID})`} />
      {data!.label && (
        <text x={data!.lx} y={data!.ly} textAnchor="middle">
          {data!.label}
        </text>
      )}
    </g>
  );
}

const nodeTypes = { mind: MindNodeView };
const edgeTypes = { mindBranch: MindBranchEdge, mindLink: MindLinkEdge };

export function MindmapFlow() {
  return (
    <ReactFlowProvider>
      <MindmapFlowInner />
    </ReactFlowProvider>
  );
}

function MindmapFlowInner() {
  const model = useApp((s) => s.mindmap);
  const diagnostics = useApp((s) => s.diagnostics);
  const overrides = useApp((s) => s.mindCollapsed);
  const docVersion = useApp((s) => s.docVersion);
  const mindFocus = useApp((s) => s.mindFocus);
  const [selected, setSelected] = useState<string | null>(null);
  const rf = useReactFlow();
  const container = useRef<HTMLDivElement>(null);

  const layout = useMemo(
    () => model && layoutMindmap(model, { collapsed: (n) => isCollapsed(model, n, overrides) }),
    [model, overrides],
  );
  const keyed = useMemo(() => layout && keyLayout(layout), [layout]);

  // Node cần giữ đứng yên ở lần layout kế tiếp (node vừa bấm mở/đóng); mặc định là gốc.
  const anchor = useRef<string | null>(null);
  // Vẽ frame chuyển động thẳng vào DOM; đọc layout mới nhất qua ref.
  const branches = useRef(new Map<string, BranchInfo>());
  const dom = useRef<DomIndex | null>(null);
  const paint = useRef<(frame: Placed[]) => void>(() => {});
  paint.current = (frame) => {
    if (!layout || !keyed || !container.current) return;
    dom.current ??= new DomIndex(container.current);
    paintFrame(dom.current, frame, buildEdges(frame, layout, keyed, branches.current));
  };
  const items = useAnimatedLayout(layout, keyed, anchor, docVersion, paint);

  const toggle = useMemo(
    () => (key: string) => {
      const { mindmap, mindCollapsed, setMindCollapsed } = useApp.getState();
      const box = layout?.boxes.find((b) => keyed?.keys.get(b) === key);
      const node = box && mindmap && findMindNode(mindmap.root, box.node.id);
      if (!node) return;
      anchor.current = key;
      setMindCollapsed({ ...mindCollapsed, [node.id]: !isCollapsed(mindmap, node, mindCollapsed) });
    },
    [layout, keyed],
  );

  // Dữ liệu node chỉ đổi khi layout/diagnostics/chọn đổi — các frame chuyển động chỉ đổi vị trí.
  const dataByBox = useMemo(() => {
    const result = new Map<MindBox, MindNodeData>();
    if (!layout) return result;
    const severity = mindSeverityByBox(layout.boxes, diagnostics);
    for (const box of layout.boxes) result.set(box, nodeData(box, severity.get(box), selected));
    return result;
  }, [layout, diagnostics, selected]);
  // Node đang biến mất thuộc layout cũ: giữ dữ liệu cũ của nó.
  const lastData = useRef(new Map<MindBox, MindNodeData>());
  useEffect(() => {
    lastData.current = dataByBox;
  }, [dataByBox]);

  const nodes = useMemo<MindNodeType[]>(
    () =>
      items.map((p) => ({
        id: p.key,
        type: 'mind',
        position: { x: p.x, y: p.y },
        width: p.box.width,
        height: p.box.height,
        // Kích thước đã biết từ layout: React Flow không phải đo lại mỗi frame (thiếu thì nhánh bị ẩn).
        measured: { width: p.box.width, height: p.box.height },
        data:
          dataByBox.get(p.box) ?? lastData.current.get(p.box) ?? nodeData(p.box, undefined, null),
        style: p.opacity < 1 ? { opacity: p.opacity, pointerEvents: 'none' } : undefined,
        draggable: false,
        selectable: false,
        connectable: false,
      })),
    [items, dataByBox],
  );

  const edges = useMemo(() => {
    if (!layout || !keyed) return [];
    rememberBranches(branches.current, layout, keyed);
    return buildEdges(items, layout, keyed, branches.current);
  }, [items, layout, keyed]);

  // Căn khung khi mở file / lần đầu có mind map.
  const initialized = useNodesInitialized();
  const fittedFor = useRef<number | null>(null);
  useEffect(() => {
    if (initialized && items.length && fittedFor.current !== docVersion) {
      fittedFor.current = docVersion;
      void rf.fitView(FIT_VIEW);
    }
  }, [initialized, items.length, docVersion, rf]);

  const keyOf = (id: string | null) => {
    const box = id === null ? undefined : layout?.boxes.find((b) => b.node.id === id);
    return box && keyed?.keys.get(box);
  };
  const keyOfRef = useRef(keyOf);
  keyOfRef.current = keyOf;

  /** Đưa node vào khung nhìn: `center` luôn căn giữa, không thì chỉ cuộn khi node nằm ngoài khung. */
  const bringIntoView = (key: string, center: boolean) => {
    const node = rf.getNode(key);
    const rect = container.current?.getBoundingClientRect();
    if (!node || !rect) return;
    const { x, y, zoom } = rf.getViewport();
    const w = node.measured?.width ?? 0;
    const h = node.measured?.height ?? 0;
    const left = node.position.x * zoom + x;
    const top = node.position.y * zoom + y;
    const margin = 40;
    const inside =
      left >= margin &&
      top >= margin &&
      left + w * zoom <= rect.width - margin &&
      top + h * zoom <= rect.height - margin;
    if (center || !inside) {
      void rf.setCenter(node.position.x + w / 2, node.position.y + h / 2, { zoom, duration: 200 });
    }
  };

  /** Đợi chuyển động mở/đóng xong rồi mới tính vị trí node. */
  const afterAnimation = (fn: () => void) => setTimeout(fn, DURATION_MS + 40);

  // Tìm kiếm chọn một node: các nhánh trên đường đi đã được mở trong store.
  useEffect(() => {
    if (!mindFocus) return;
    setSelected(mindFocus.id);
    container.current?.focus({ preventScroll: true });
    // Layout lúc hết chuyển động là layout mới nhất → đọc qua ref.
    const timer = afterAnimation(() => {
      const key = keyOfRef.current(mindFocus.id);
      if (key) bringIntoView(key, true);
    });
    return () => clearTimeout(timer);
  }, [mindFocus]); // chỉ chạy khi có yêu cầu mới

  const reveal = (id: string, focus: boolean) => {
    const { mindmap, revealLine } = useApp.getState();
    const source = mindmap && findMindNode(mindmap.root, id)?.source;
    if (source) revealLine(source.line, source.column, focus);
  };

  const onNodeClick = (_: unknown, n: MindNodeType) => {
    const id = n.data.box.node.id;
    setSelected(id);
    // Focus ở lại Preview để dùng phím mũi tên; editor vẫn nhảy tới dòng của node.
    container.current?.focus({ preventScroll: true });
    reveal(id, false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!layout || e.target !== container.current) return;
    const box = selected === null ? undefined : layout.boxes.find((b) => b.node.id === selected);
    if (e.key === 'Escape') {
      setSelected(null);
      return;
    }
    if (box && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      if (e.key === 'Enter') reveal(box.node.id, true);
      else if (box.childCount && box.side !== 'root') toggle(keyed!.keys.get(box)!);
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const result = navigate(layout, box, e.key as NavKey);
    if (!result) return;
    if ('expand' in result) {
      const key = keyed!.keys.get(result.expand)!;
      toggle(key);
      afterAnimation(() => bringIntoView(key, false));
      return;
    }
    const id = result.select.node.id;
    setSelected(id);
    reveal(id, false);
    bringIntoView(keyed!.keys.get(result.select)!, false);
  };

  return (
    <div
      className="mind-flow ac-diagram ac-mindmap"
      data-testid="preview"
      ref={container}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label="Mind map — phím mũi tên để di chuyển, Space để mở/đóng, Enter để tới YAML"
    >
      <MindToolbar model={model} />
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <marker
            id={MARKER_ID}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerUnits="userSpaceOnUse"
            markerWidth="10"
            markerHeight="10"
            orient="auto-start-reverse"
          >
            <path className="ac-mm-arrow" d="M0,0 L10,5 L0,10 z" />
          </marker>
        </defs>
      </svg>
      {model ? (
        <ToggleContext.Provider value={toggle}>
          <ReactFlow<MindNodeType, MindBranchEdgeType | MindLinkEdgeType>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={onNodeClick}
            onPaneClick={() => setSelected(null)}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
            nodesFocusable={false}
            elementsSelectable={false}
            deleteKeyCode={null}
            minZoom={0.1}
            maxZoom={4}
            proOptions={{ hideAttribution: true }}
          />
        </ToggleContext.Provider>
      ) : (
        <div className="placeholder">Mind map sẽ hiển thị khi YAML hợp lệ</div>
      )}
    </div>
  );
}

function MindToolbar({ model }: { model: MindmapModel | null }) {
  const rf = useReactFlow();
  const depth = model ? maxDepth(model) : 0;
  const apply = (next: Record<string, boolean>) => useApp.getState().setMindCollapsed(next);
  return (
    <div className="preview-tools">
      <button type="button" onClick={() => void rf.zoomIn()} title="Phóng to">
        +
      </button>
      <button type="button" onClick={() => void rf.zoomOut()} title="Thu nhỏ">
        −
      </button>
      <button type="button" onClick={() => void rf.fitView({ ...FIT_VIEW, duration: 200 })}>
        Vừa khung
      </button>
      <span className="sep" />
      <button
        type="button"
        disabled={!model}
        onClick={() => model && apply(setAll(model, false))}
        data-testid="mind-expand-all"
      >
        Mở hết
      </button>
      <button
        type="button"
        disabled={!model}
        onClick={() => model && apply(setAll(model, true))}
        data-testid="mind-collapse-all"
      >
        Thu hết
      </button>
      <select
        aria-label="Mở tới tầng"
        title="Mở tới tầng"
        value=""
        disabled={!model}
        onChange={(e) => model && apply(expandToDepth(model, Number(e.target.value)))}
        data-testid="mind-depth"
      >
        <option value="" disabled>
          Tầng…
        </option>
        {Array.from({ length: depth }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            Tầng {i + 1}
          </option>
        ))}
      </select>
    </div>
  );
}

function nodeData(box: MindBox, sev: Severity | undefined, selected: string | null): MindNodeData {
  return {
    box,
    className: mindNodeClass(box, sev) + (selected === box.node.id ? ' ac-selected' : ''),
    body: mindNodeBodySvg(box, { local: true, badge: false }),
    tooltip: mindNodeTooltip(box),
    collapsed: box.hidden > 0,
  };
}

/**
 * Vị trí node theo thời gian: mỗi khi layout đổi, chạy chuyển động từ vị trí đang hiển thị tới
 * layout mới. Cả cây được dịch sao cho node neo (node vừa bấm, mặc định là gốc) đứng yên.
 */
function useAnimatedLayout(
  layout: MindmapLayout | null,
  keyed: ReturnType<typeof keyLayout> | null,
  anchor: React.RefObject<string | null>,
  docVersion: number,
  paint: React.RefObject<(frame: Placed[]) => void>,
): Placed[] {
  const [items, setItems] = useState<Placed[]>([]);
  const shown = useRef(new Map<string, Placed>());
  const prevParentOf = useRef(new Map<string, string>());
  const shift = useRef({ x: 0, y: 0 });
  const raf = useRef(0);
  const doc = useRef(docVersion);

  useLayoutEffect(() => {
    cancelAnimationFrame(raf.current);
    if (doc.current !== docVersion) {
      // Mở file khác: không chuyển động, không giữ độ dịch cũ.
      doc.current = docVersion;
      shown.current = new Map();
      shift.current = { x: 0, y: 0 };
    }
    if (!layout || !keyed) {
      shown.current = new Map();
      setItems([]);
      return;
    }
    const prev = shown.current;
    const anchorKey = anchor.current ?? keyed.keys.get(layout.boxes[0]!)!;
    anchor.current = null;
    const anchorBox = layout.boxes.find((b) => keyed.keys.get(b) === anchorKey);
    const anchorPrev = prev.get(anchorKey);
    if (anchorBox && anchorPrev) {
      shift.current = { x: anchorPrev.x - anchorBox.x, y: anchorPrev.y - anchorBox.y };
    }
    const next: Placed[] = layout.boxes.map((box) => ({
      key: keyed.keys.get(box)!,
      box,
      x: box.x + shift.current.x,
      y: box.y + shift.current.y,
      opacity: 1,
    }));

    const tr = planTransition(prev, next, prevParentOf.current, keyed.parentOf);
    prevParentOf.current = keyed.parentOf;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!prev.size || reduced) {
      finish(next);
      return;
    }
    // React chỉ render hai lần: frame đầu (gắn node mới vào DOM tại điểm xuất phát) và frame cuối.
    // Các frame giữa ghi thẳng transform/path vào DOM — render lại 300 node mỗi frame không đạt 50 fps.
    const first = frameAt(tr, 0);
    shown.current = new Map(first.map((p) => [p.key, p]));
    setItems(first);
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / DURATION_MS);
      if (t >= 1) return finish(next);
      const frame = frameAt(tr, easeOutCubic(t));
      shown.current = new Map(frame.map((p) => [p.key, p]));
      paint.current(frame);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);

    function finish(final: Placed[]) {
      shown.current = new Map(final.map((p) => [p.key, p]));
      setItems(final);
    }
    return () => cancelAnimationFrame(raf.current);
  }, [layout, keyed, anchor, docVersion, paint]);

  return items;
}

/** Phần tử DOM của node/edge React Flow theo `data-id`; dựng lại bảng khi gặp id chưa có. */
class DomIndex {
  private nodes = new Map<string, HTMLElement>();
  private edges = new Map<string, SVGGElement>();
  private rebuilt = false;

  constructor(private root: HTMLElement) {}

  node(id: string): HTMLElement | undefined {
    return this.lookup(this.nodes, id) as HTMLElement | undefined;
  }

  edge(id: string): SVGGElement | undefined {
    return this.lookup(this.edges, id) as SVGGElement | undefined;
  }

  /** Mỗi frame dựng lại tối đa một lần (edge của node mới có thể gắn vào DOM chậm một frame). */
  nextFrame() {
    this.rebuilt = false;
  }

  private lookup(map: Map<string, Element>, id: string) {
    const hit = map.get(id);
    if (hit?.isConnected) return hit;
    if (this.rebuilt) return undefined;
    this.rebuilt = true;
    this.nodes.clear();
    this.edges.clear();
    for (const el of this.root.querySelectorAll<HTMLElement>('.react-flow__node[data-id]'))
      this.nodes.set(el.dataset.id!, el);
    for (const el of this.root.querySelectorAll<SVGGElement>('.react-flow__edge[data-id]'))
      this.edges.set(el.dataset.id!, el);
    return map.get(id);
  }
}

/** Ghi một frame chuyển động thẳng vào DOM (vị trí node, độ mờ, path của nhánh và link). */
function paintFrame(
  dom: DomIndex,
  frame: Placed[],
  edges: (MindBranchEdgeType | MindLinkEdgeType)[],
) {
  dom.nextFrame();
  for (const p of frame) {
    const el = dom.node(p.key);
    if (!el) continue;
    el.style.transform = `translate(${p.x}px,${p.y}px)`;
    el.style.opacity = p.opacity < 1 ? String(p.opacity) : '';
  }
  for (const edge of edges) {
    const g = dom.edge(edge.id);
    const path = g?.querySelector('path');
    if (!path) continue;
    const data = edge.data!;
    path.setAttribute('d', data.d);
    if ('opacity' in data) path.style.opacity = String(data.opacity);
    else {
      const text = g!.querySelector('text');
      text?.setAttribute('x', String(data.lx));
      text?.setAttribute('y', String(data.ly));
    }
  }
}

/** Nhánh cha → con, điểm neo tính tương đối với góc trên trái của cha/con. */
interface BranchInfo {
  parent: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  className: string;
}

/** Ghi nhớ hình học nhánh của mọi layout đã gặp — node đang biến mất vẫn vẽ được nhánh tới cha cũ. */
function rememberBranches(
  memory: Map<string, BranchInfo>,
  layout: MindmapLayout,
  keyed: ReturnType<typeof keyLayout>,
) {
  for (const b of layout.branches) {
    memory.set(keyed.keys.get(b.child)!, {
      parent: keyed.keys.get(b.parent)!,
      from: { x: b.from.x - b.parent.x, y: b.from.y - b.parent.y },
      to: { x: b.to.x - b.child.x, y: b.to.y - b.child.y },
      className: mindBranchClass(b.child),
    });
  }
}

/** Nhánh cây và link chéo theo vị trí đang hiển thị; điểm neo dịch theo node. */
function buildEdges(
  items: Placed[],
  layout: MindmapLayout,
  keyed: ReturnType<typeof keyLayout>,
  branches: Map<string, BranchInfo>,
): (MindBranchEdgeType | MindLinkEdgeType)[] {
  const byKey = new Map(items.map((p) => [p.key, p]));
  const edges: (MindBranchEdgeType | MindLinkEdgeType)[] = [];
  for (const child of items) {
    const info = branches.get(child.key);
    const parent = info && byKey.get(info.parent);
    if (!info || !parent) continue;
    const from = { x: parent.x + info.from.x, y: parent.y + info.from.y };
    const to = { x: child.x + info.to.x, y: child.y + info.to.y };
    edges.push({
      id: `b:${child.key}`,
      type: 'mindBranch',
      source: parent.key,
      target: child.key,
      data: { d: mindBranchPath(from, to), className: info.className, opacity: child.opacity },
    });
  }
  layout.links.forEach(({ link, from, to }, i) => {
    const a = byKey.get(keyed.keys.get(from)!);
    const b = byKey.get(keyed.keys.get(to)!);
    if (!a || !b) return;
    const g = mindLinkGeometry(
      { x: a.x, y: a.y, width: a.box.width, height: a.box.height },
      { x: b.x, y: b.y, width: b.box.width, height: b.box.height },
    );
    edges.push({
      id: `l:${i}`,
      type: 'mindLink',
      source: a.key,
      target: b.key,
      zIndex: 10,
      data: { d: g.d, label: link.label, lx: g.label.x, ly: g.label.y },
    });
  });
  return edges;
}
