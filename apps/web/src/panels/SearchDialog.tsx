import type { ArchitectureModel, MindmapModel, MindNode } from '@archcode/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store';

interface Item {
  key: string;
  /** id so khớp khi tìm (id component/group, id node mind map khai báo rõ ràng). */
  id: string;
  title: string;
  detail: string;
  choose(): void;
}

interface Hit extends Item {
  score: number;
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

function architectureItems(model: ArchitectureModel): Item[] {
  const focus = useApp.getState().focusElement;
  return [
    ...model.components.map((c) => ({
      key: `component:${c.id}`,
      id: c.id,
      title: c.name,
      detail: [c.id, c.type, c.technology, c.owner].filter(Boolean).join(' · '),
      choose: () => focus({ kind: 'component', id: c.id }),
    })),
    ...model.groups.map((g) => ({
      key: `group:${g.id}`,
      id: g.id,
      title: g.name,
      detail: ['group', g.id, g.type].filter(Boolean).join(' · '),
      choose: () => focus({ kind: 'group', id: g.id }),
    })),
  ];
}

/** Mọi node mind map, kể cả node đang nằm trong nhánh thu gọn; chi tiết là đường dẫn từ gốc. */
function mindmapItems(model: MindmapModel): Item[] {
  const items: Item[] = [];
  const visit = (node: MindNode, trail: string[]) => {
    items.push({
      key: `mind:${node.id}`,
      id: node.explicitId ? node.id : '',
      title: node.text,
      detail: [trail.join(' › '), node.tags.map((t) => `#${t}`).join(' ')]
        .filter(Boolean)
        .join(' · '),
      choose: () => useApp.getState().focusMindNode(node.id),
    });
    for (const child of node.children) visit(child, [...trail, node.text]);
  };
  visit(model.root, []);
  return items;
}

/** Ctrl+K: tìm component/group theo id, tên, công nghệ, owner (S5-NAV-01); node mind map theo chữ, tag. */
export function SearchDialog() {
  const open = useApp((s) => s.searchOpen);
  const model = useApp((s) => s.model);
  const mindmap = useApp((s) => s.mindmap);
  const isMindmap = useApp((s) => s.kind === 'mindmap');
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
    const items = isMindmap
      ? mindmap
        ? mindmapItems(mindmap)
        : []
      : model
        ? architectureItems(model)
        : [];
    const q = fold(query.trim());
    return items
      .map((item) => {
        if (!q) return { ...item, score: 1 };
        const title = fold(item.title);
        const id = fold(item.id);
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
  }, [model, mindmap, isMindmap, query]);

  if (!open) return null;
  const close = () => useApp.getState().setSearchOpen(false);
  const choose = (hit: Hit | undefined) => {
    if (!hit) return;
    close();
    hit.choose();
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
          placeholder={
            isMindmap
              ? 'Tìm node theo nội dung, id, tag…'
              : 'Tìm component, group theo id, tên, công nghệ, owner…'
          }
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
              key={hit.key}
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
