import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import type { CanvasGroup, CanvasNode } from '../worker/api';

export type ComponentNodeType = Node<{ node: CanvasNode }, 'component'>;
export type GroupNodeType = Node<{ group: CanvasGroup }, 'group'>;

const SIDES = [
  ['top', Position.Top],
  ['right', Position.Right],
  ['bottom', Position.Bottom],
  ['left', Position.Left],
] as const;

/** Node dùng chung shape/màu/chữ với renderer SVG của HTML xuất ra (S4-CANVAS-02). */
export const ComponentNode = memo(function ComponentNode({
  data,
  selected,
}: NodeProps<ComponentNodeType>) {
  const n = data.node;
  return (
    <div className="arch-node" title={n.tooltip} style={{ width: n.width, height: n.height }}>
      <svg width={n.width} height={n.height} overflow="visible" aria-hidden>
        <g
          className={`${n.className}${selected ? ' ac-selected' : ''}`}
          data-kind="component"
          data-id={n.id}
          dangerouslySetInnerHTML={{ __html: n.body }}
        />
      </svg>
      {/* Handle ẩn: điểm neo cho connector (đường đi do router của core tính). */}
      <Handle
        type="target"
        id="t"
        position={Position.Top}
        className="h-anchor"
        isConnectable={false}
      />
      <Handle
        type="source"
        id="s"
        position={Position.Bottom}
        className="h-anchor"
        isConnectable={false}
      />
      {SIDES.map(([id, position]) => (
        <Handle key={id} type="source" id={id} position={position} className="h-connect" />
      ))}
    </div>
  );
});

export const GroupNode = memo(function GroupNode({ data, selected }: NodeProps<GroupNodeType>) {
  const g = data.group;
  const state = g.severity === 'error' ? ' error' : g.severity === 'warning' ? ' warning' : '';
  return (
    <div
      className={`arch-group${state}${selected ? ' selected' : ''}`}
      data-kind="group"
      data-id={g.id}
    >
      <span className="arch-group-label">{g.label}</span>
      {/* Handle ẩn: điểm neo cho connector nối vào group. */}
      <Handle
        type="target"
        id="t"
        position={Position.Top}
        className="h-anchor"
        isConnectable={false}
      />
      <Handle
        type="source"
        id="s"
        position={Position.Bottom}
        className="h-anchor"
        isConnectable={false}
      />
    </div>
  );
});
