import { Canvas } from '../canvas/Canvas';
import { Preview } from '../preview/Preview';
import { useApp } from '../store';
import { PropertyPanel } from './PropertyPanel';

/** Khung bên phải: Canvas (sửa trực quan) hoặc Xem trước (đúng bản sẽ xuất ra HTML). */
export function Workspace() {
  const isMindmap = useApp((s) => s.kind === 'mindmap');
  const storedMode = useApp((s) => s.mode);
  // Mind map chưa có canvas: luôn hiển thị Xem trước, giữ nguyên lựa chọn cho file kiến trúc.
  const mode = isMindmap ? 'preview' : storedMode;
  const viewId = useApp((s) => s.viewId);
  const multiSelection = useApp((s) => s.multiSelection);
  const pinned = useApp((s) =>
    s.viewId ? Object.keys(s.layout.views[s.viewId]?.nodes ?? {}).length : 0,
  );

  return (
    <div className="workspace">
      <div className="workspace-bar">
        <div className="segmented" role="tablist" aria-label="Chế độ hiển thị">
          {(['canvas', 'preview'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={mode === m ? 'active' : ''}
              onClick={() => useApp.getState().setMode(m)}
              disabled={isMindmap && m === 'canvas'}
              title={
                isMindmap && m === 'canvas' ? 'Mind map chưa hỗ trợ sửa trên canvas' : undefined
              }
              data-testid={`mode-${m}`}
            >
              {m === 'canvas' ? 'Canvas' : 'Xem trước'}
            </button>
          ))}
        </div>
        {mode === 'canvas' && viewId && (
          <>
            <span className="hint-text">
              {pinned ? `Bố cục thủ công (${pinned} node đã ghim)` : 'Bố cục tự động'}
            </span>
            <button
              type="button"
              onClick={() => useApp.getState().relayout(viewId)}
              disabled={!pinned && !Object.keys(useApp.getState().sticky[viewId] ?? {}).length}
              title="Bỏ mọi vị trí đã ghim của view, sắp xếp lại tự động"
              data-testid="relayout"
            >
              Sắp xếp lại
            </button>
            {multiSelection.length > 0 && (
              <button
                type="button"
                onClick={() => useApp.getState().relayout(viewId, multiSelection)}
                title="Bỏ ghim các node đang chọn để tự đặt lại"
              >
                Sắp xếp lại {multiSelection.length} node đã chọn
              </button>
            )}
          </>
        )}
      </div>
      {mode === 'canvas' ? (
        <div className="workspace-body">
          <Canvas />
          <PropertyPanel />
        </div>
      ) : (
        <Preview />
      )}
    </div>
  );
}
