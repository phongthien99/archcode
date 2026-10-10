import type { Severity } from '@archcode/core';
import { useState } from 'react';
import { useApp } from '../store';

const LABEL: Record<Severity, string> = { error: 'Lỗi', warning: 'Cảnh báo', info: 'Thông tin' };

export function DiagnosticsPanel() {
  const diagnostics = useApp((s) => s.diagnostics);
  const revealLine = useApp((s) => s.revealLine);
  const select = useApp((s) => s.select);
  const [filter, setFilter] = useState<'all' | Severity>('all');
  const [open, setOpen] = useState(true);

  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
  const shown = diagnostics.filter((d) => filter === 'all' || d.severity === filter);

  return (
    <section className={`diagnostics${open ? '' : ' collapsed'}`} aria-label="Kết quả kiểm tra">
      <header>
        <button
          type="button"
          className="toggle"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? '▾' : '▸'} Kiểm tra
        </button>
        <span className={`count error${errors ? '' : ' zero'}`} data-testid="error-count">
          {errors} lỗi
        </span>
        <span className={`count warning${warnings ? '' : ' zero'}`}>{warnings} cảnh báo</span>
        {open && (
          <div className="filters" role="radiogroup" aria-label="Lọc">
            {(['all', 'error', 'warning'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={filter === f}
                className={filter === f ? 'active' : ''}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'Tất cả' : LABEL[f]}
              </button>
            ))}
          </div>
        )}
      </header>
      {open && (
        <ul>
          {shown.length === 0 && (
            <li className="empty">
              {diagnostics.length ? 'Không có mục nào theo bộ lọc' : '✓ Không có lỗi hay cảnh báo'}
            </li>
          )}
          {shown.map((d, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  if (d.line) revealLine(d.line, d.column);
                  if (d.target) select(d.target);
                }}
              >
                <span className={`sev ${d.severity}`}>{LABEL[d.severity]}</span>
                <span className="loc">{d.line ? `${d.line}:${d.column ?? 1}` : '—'}</span>
                <span className="msg">
                  {d.message}
                  {d.hint && <span className="hint"> ↳ {d.hint}</span>}
                </span>
                <code className="code">{d.rule ?? d.code}</code>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
