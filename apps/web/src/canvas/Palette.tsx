import { COMPONENT_TYPES } from '@archcode/core/canvas';

export const PALETTE_MIME = 'application/x-archcode-type';

const LABEL: Record<string, string> = {
  person: 'Người dùng',
  system: 'Hệ thống',
  external: 'Bên ngoài',
  frontend: 'Frontend',
  gateway: 'Gateway',
  service: 'Service',
  database: 'Database',
  queue: 'Queue',
  storage: 'Storage',
  cache: 'Cache',
};

/** Palette 10 loại component: kéo thả vào canvas để tạo (S4-EDIT-01). */
export function Palette({ disabled }: { disabled: boolean }) {
  return (
    <div className="palette" aria-label="Thêm component" data-testid="palette">
      {COMPONENT_TYPES.map((type) => (
        <div
          key={type}
          className={`palette-item${disabled ? ' disabled' : ''}`}
          draggable={!disabled}
          data-type={type}
          title={disabled ? 'Canvas đang chỉ đọc' : `Kéo vào canvas để thêm ${type}`}
          onDragStart={(e) => {
            e.dataTransfer.setData(PALETTE_MIME, type);
            e.dataTransfer.effectAllowed = 'copy';
          }}
        >
          <svg className={`ac-t-${type}`} width="18" height="14" aria-hidden>
            <rect className="ac-shape" x="1" y="1" width="16" height="12" rx="3" />
          </svg>
          {LABEL[type]}
        </div>
      ))}
    </div>
  );
}
