import { edgePath, type Point } from '@archcode/core/canvas';
import { useReactFlow, type Edge, type EdgeProps } from '@xyflow/react';
import { createContext, memo, useContext } from 'react';
import type { CanvasEdge } from '../worker/api';
import { useRoute } from './routes';

/** Sửa điểm gấp của connector: `draft` khi đang kéo (vẽ lại tức thì), `commit` khi thả. */
export interface WaypointEditor {
  readOnly: boolean;
  draft(edgeId: string, points: Point[] | null): void;
  commit(edgeId: string, points: Point[] | null): void;
}

export const WaypointContext = createContext<WaypointEditor | null>(null);

const GRID = 10;
const snap = (p: Point): Point => ({
  x: Math.round(p.x / GRID) * GRID,
  y: Math.round(p.y / GRID) * GRID,
});

export type ArchEdgeType = Edge<{ edge: CanvasEdge }, 'arch'>;

/** Connector: mũi tên, nhãn `label` + `[type]`, nét đứt cho quan hệ bất đồng bộ, màu theo lỗi (S4-CANVAS-03). */
export const EdgeView = memo(function EdgeView({ data, selected }: EdgeProps<ArchEdgeType>) {
  const edge = data!.edge;
  const route = useRoute(edge.id);
  if (!route || route.points.length < 2) return null;
  const d = edgePath(route.points);
  const sev = edge.severity === 'error' || edge.severity === 'warning' ? edge.severity : undefined;
  const label = edge.label && route.label ? { ...edge.label, ...route.label } : undefined;
  return (
    <g
      className={`ac-edge${edge.async ? ' ac-async' : ''}${sev ? ` ac-${sev}` : ''}${selected ? ' ac-selected' : ''}`}
      data-kind="relationship"
      data-id={edge.id}
    >
      <path
        d={d}
        markerEnd={`url(#canvas-arrow${sev ? `-${sev}` : selected ? '-selected' : ''})`}
      />
      <path
        d={d}
        className="react-flow__edge-interaction"
        // dasharray: none — `.ac-edge>path` vẽ nét đứt; vùng click phải liền, không thì click rơi vào khe.
        style={{ stroke: 'transparent', strokeWidth: 14, fill: 'none', strokeDasharray: 'none' }}
      />
      {selected && <WaypointHandles id={edge.id} points={route.points} />}
      {label && (
        <g className="ac-label">
          <rect x={label.x} y={label.y} width={label.width} height={label.height} rx={3} />
          {label.lines.map((line, i) => (
            <text
              key={i}
              x={label.x + label.width / 2}
              y={label.y + 14 + i * 14}
              textAnchor="middle"
            >
              {line}
            </text>
          ))}
        </g>
      )}
    </g>
  );
});

/**
 * Tay nắm trên connector đang chọn: chấm tròn = điểm gấp (kéo để dời, double-click để bỏ),
 * chấm nhỏ giữa mỗi đoạn = kéo để thêm điểm gấp. Đường tự định tuyến cũng sửa được: các góc
 * hiện có trở thành điểm gấp ngay khi bắt đầu kéo.
 */
function WaypointHandles({ id, points }: { id: string; points: Point[] }) {
  const editor = useContext(WaypointContext);
  const rf = useReactFlow();
  if (!editor || editor.readOnly) return null;
  const inner = points.slice(1, -1);

  const drag = (e: React.PointerEvent, update: (base: Point[], p: Point) => Point[]) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    // Nghe trên window: tay nắm có thể bị render lại/biến mất khi đường đi đổi trong lúc kéo.
    let last: Point[] | null = null;
    const move = (ev: PointerEvent) => {
      last = update(inner, snap(rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY })));
      editor.draft(id, last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      editor.draft(id, null);
      if (last) editor.commit(id, last);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  return (
    <g className="ac-waypoints nodrag nopan">
      {points.slice(1).map((b, i) => {
        const a = points[i]!;
        if (Math.hypot(b.x - a.x, b.y - a.y) < 24) return null;
        return (
          <circle
            key={`m${i}`}
            className="ac-waypoint-add"
            data-testid="waypoint-add"
            cx={(a.x + b.x) / 2}
            cy={(a.y + b.y) / 2}
            r={4}
            onPointerDown={(e) => drag(e, (base, p) => [...base.slice(0, i), p, ...base.slice(i)])}
          >
            <title>Kéo để thêm điểm gấp</title>
          </circle>
        );
      })}
      {inner.map((p, i) => (
        <circle
          key={`w${i}`}
          className="ac-waypoint"
          data-testid="waypoint"
          cx={p.x}
          cy={p.y}
          r={6}
          onPointerDown={(e) => drag(e, (base, q) => base.map((x, j) => (j === i ? q : x)))}
          onDoubleClick={(e) => {
            e.stopPropagation();
            editor.commit(
              id,
              inner.filter((_, j) => j !== i),
            );
          }}
        >
          <title>Kéo để dời · double-click để bỏ điểm gấp</title>
        </circle>
      ))}
    </g>
  );
}

/** Marker mũi tên dùng chung cho mọi connector trên canvas (tham chiếu qua url(#id) trong cùng document). */
export function ArrowMarkers() {
  const marker = (suffix: string, cls: string) => (
    <marker
      id={`canvas-arrow${suffix}`}
      viewBox="0 0 10 10"
      refX="9"
      refY="5"
      markerUnits="userSpaceOnUse"
      markerWidth="11"
      markerHeight="11"
      orient="auto-start-reverse"
    >
      <path className={cls} d="M0,0 L10,5 L0,10 z" />
    </marker>
  );
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {marker('', 'ac-arrow')}
        {marker('-error', 'ac-arrow ac-arrow-error')}
        {marker('-warning', 'ac-arrow ac-arrow-warning')}
        {marker('-selected', 'ac-arrow ac-arrow-selected')}
      </defs>
    </svg>
  );
}
