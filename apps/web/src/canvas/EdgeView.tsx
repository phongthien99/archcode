import type { Edge, EdgeProps } from '@xyflow/react';
import { memo } from 'react';
import type { CanvasEdge } from '../worker/api';
import { useRoute } from './routes';

export type ArchEdgeType = Edge<{ edge: CanvasEdge }, 'arch'>;

/** Connector: mũi tên, nhãn `label` + `[type]`, nét đứt cho quan hệ bất đồng bộ, màu theo lỗi (S4-CANVAS-03). */
export const EdgeView = memo(function EdgeView({ data, selected }: EdgeProps<ArchEdgeType>) {
  const edge = data!.edge;
  const route = useRoute(edge.id);
  if (!route || route.points.length < 2) return null;
  const d = route.points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
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
        style={{ stroke: 'transparent', strokeWidth: 14, fill: 'none' }}
      />
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
