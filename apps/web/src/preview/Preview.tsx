import type { ArchitectureModel, DiagnosticTarget } from '@archcode/core';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MindmapFlow } from '../mindmap/MindmapFlow';
import { useApp } from '../store';

interface Transform {
  x: number;
  y: number;
  k: number;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 4;
/** Từ spike ELK: view lớn hơn ngưỡng này layout chậm và khó đọc → gợi ý tách view. */
const LARGE_VIEW = 150;

export function Preview() {
  const isMindmap = useApp((s) => s.kind === 'mindmap');
  const stale = useApp((s) => s.stale);
  if (!isMindmap) return <SvgPreview />;
  return (
    <div className="preview">
      {stale && (
        <div className="banner warn" role="status">
          YAML đang lỗi cú pháp — đang hiển thị bản hợp lệ gần nhất
        </div>
      )}
      <MindmapFlow />
    </div>
  );
}

/** Xem trước kiến trúc: SVG do core sinh ra, kéo/zoom bằng transform. */
function SvgPreview() {
  const svg = useApp((s) => s.svg);
  const viewId = useApp((s) => s.viewId);
  const stale = useApp((s) => s.stale);
  const nodeCount = useApp((s) => s.nodeCount);
  const selection = useApp((s) => s.selection);
  const container = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [t, setT] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number; t: Transform; moved: boolean } | null>(null);

  const fit = useCallback(() => {
    const svgEl = content.current?.querySelector('svg');
    const box = container.current?.getBoundingClientRect();
    if (!svgEl || !box) return;
    const w = Number(svgEl.getAttribute('width'));
    const h = Number(svgEl.getAttribute('height'));
    const k = Math.min((box.width - 32) / w, (box.height - 32) / h, 1);
    setT({ k, x: (box.width - w * k) / 2, y: (box.height - h * k) / 2 });
  }, []);

  const actual = useCallback(() => {
    const box = container.current?.getBoundingClientRect();
    if (!box) return;
    setT((prev) => zoomAt(prev, 1 / prev.k, box.width / 2, box.height / 2));
  }, []);

  // Tự căn khung khi đổi view hoặc lần đầu có diagram; khi đang sửa YAML thì giữ nguyên góc nhìn.
  const fittedFor = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (svg && fittedFor.current !== viewId) {
      fittedFor.current = viewId;
      fit();
    }
    if (!svg) fittedFor.current = null;
  }, [svg, viewId, fit]);

  // Đánh dấu phần tử đang chọn.
  useEffect(() => {
    const root = content.current;
    if (!root) return;
    root.querySelectorAll('.ac-selected').forEach((el) => el.classList.remove('ac-selected'));
    if (selection) {
      const selector = `.ac-node[data-kind="${selection.kind}"][data-id="${CSS.escape(selection.id)}"], .ac-edge[data-kind="${selection.kind}"][data-id="${CSS.escape(selection.id)}"]`;
      root.querySelector(selector)?.classList.add('ac-selected');
    }
  }, [selection, svg]);

  // Wheel phải non-passive để chặn cuộn trang.
  useEffect(() => {
    const el = container.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      setT((prev) => zoomAt(prev, factor, e.clientX - box.left, e.clientY - box.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, t, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    if (!d.moved) container.current!.setPointerCapture(e.pointerId);
    d.moved = true;
    setT({ ...d.t, x: d.t.x + dx, y: d.t.y + dy });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) return;
    const el = (e.target as Element).closest('[data-kind][data-id]');
    if (!el) {
      useApp.getState().select(null);
      return;
    }
    const target = {
      kind: el.getAttribute('data-kind'),
      id: el.getAttribute('data-id'),
    } as DiagnosticTarget;
    const { model, select, revealLine } = useApp.getState();
    select(target);
    const source = sourceOf(model, target);
    if (source) revealLine(source.line, source.column);
  };

  return (
    <div className="preview">
      <div className="preview-tools">
        <button type="button" onClick={() => setZoom(1.25)} title="Phóng to">
          +
        </button>
        <button type="button" onClick={() => setZoom(0.8)} title="Thu nhỏ">
          −
        </button>
        <button type="button" onClick={actual} title="Kích thước thật">
          {Math.round(t.k * 100)}%
        </button>
        <button type="button" onClick={fit}>
          Vừa khung
        </button>
      </div>
      {stale && (
        <div className="banner warn" role="status">
          YAML đang lỗi cú pháp — đang hiển thị bản hợp lệ gần nhất
        </div>
      )}
      {nodeCount > LARGE_VIEW && (
        <div className="banner info" role="status">
          View có {nodeCount} component — nên tách thành nhiều view nhỏ để dễ đọc
        </div>
      )}
      <div
        className="canvas"
        ref={container}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        data-testid="preview"
      >
        {svg ? (
          <div
            ref={content}
            className="canvas-content"
            style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})` }}
            // SVG do core sinh ra; mọi nội dung người dùng đã được escape (có test XSS).
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="placeholder">Diagram sẽ hiển thị khi YAML hợp lệ</div>
        )}
      </div>
    </div>
  );

  function setZoom(factor: number) {
    const box = container.current?.getBoundingClientRect();
    if (box) setT((prev) => zoomAt(prev, factor, box.width / 2, box.height / 2));
  }
}

/** Zoom quanh điểm (cx, cy) trong khung, giữ điểm đó đứng yên. */
function zoomAt(t: Transform, factor: number, cx: number, cy: number): Transform {
  const k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.k * factor));
  const ratio = k / t.k;
  return { k, x: cx - (cx - t.x) * ratio, y: cy - (cy - t.y) * ratio };
}

function sourceOf(model: ArchitectureModel | null, target: DiagnosticTarget) {
  if (!model) return undefined;
  const list =
    target.kind === 'component'
      ? model.components
      : target.kind === 'relationship'
        ? model.relationships
        : target.kind === 'group'
          ? model.groups
          : [];
  return (list as { id: string; source?: { line: number; column: number } }[]).find(
    (el) => el.id === target.id,
  )?.source;
}
