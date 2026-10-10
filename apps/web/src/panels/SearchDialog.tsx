import type { DiagnosticTarget } from '@archcode/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store';

interface Hit {
  target: DiagnosticTarget;
  title: string;
  detail: string;
  score: number;
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

/** Ctrl+K: tìm component/group theo id, tên, công nghệ, owner (S5-NAV-01). */
export function SearchDialog() {
  const open = useApp((s) => s.searchOpen);
  const model = useApp((s) => s.model);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    if (!model) return [];
    const q = fold(query.trim());
    const items: Omit<Hit, 'score'>[] = [
      ...model.components.map((c) => ({
        target: { kind: 'component' as const, id: c.id },
        title: c.name,
        detail: [c.id, c.type, c.technology, c.owner].filter(Boolean).join(' · '),
      })),
      ...model.groups.map((g) => ({
        target: { kind: 'group' as const, id: g.id },
        title: g.name,
        detail: ['group', g.id, g.type].filter(Boolean).join(' · '),
      })),
    ];
    return items
      .map((item) => {
        if (!q) return { ...item, score: 1 };
        const title = fold(item.title);
        const id = fold(item.target.id);
        const detail = fold(item.detail);
        const score =
          id === q || title === q
            ? 4
            : id.startsWith(q) || title.startsWith(q)
              ? 3
              : title.includes(q) || id.includes(q)
                ? 2
                : detail.includes(q)
                  ? 1
                  : 0;
        return { ...item, score };
      })
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
  }, [model, query]);

  if (!open) return null;
  const close = () => useApp.getState().setSearchOpen(false);
  const choose = (hit: Hit | undefined) => {
    if (!hit) return;
    close();
    useApp.getState().focusElement(hit.target);
  };

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div
        className="search"
        role="dialog"
        aria-label="Tìm kiếm"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={input}
          value={query}
          placeholder="Tìm component, group theo id, tên, công nghệ, owner…"
          aria-label="Tìm kiếm"
          data-testid="search-input"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
            else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, hits.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(hits[active]);
            }
          }}
        />
        <ul role="listbox">
          {hits.length === 0 && <li className="empty">Không tìm thấy</li>}
          {hits.map((hit, i) => (
            <li
              key={`${hit.target.kind}:${hit.target.id}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(hit)}
            >
              <strong>{hit.title}</strong>
              <span>{hit.detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
