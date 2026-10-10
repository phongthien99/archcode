import type { Component, Diagnostic, Group, Relationship } from '@archcode/core';
import { COMPONENT_TYPES, RELATIONSHIP_TYPES } from '@archcode/core/canvas';
import { useEffect, useState } from 'react';
import { deleteSelection } from '../canvas/actions';
import { useApp } from '../store';

type Kind = 'component' | 'relationship' | 'group';

/** Property panel: sửa thuộc tính phần tử đang chọn; mỗi lần sửa = một lệnh = một mục undo (S4-EDIT-03/04). */
export function PropertyPanel() {
  const selection = useApp((s) => s.selection);
  const model = useApp((s) => s.model);
  const diagnostics = useApp((s) => s.diagnostics);
  const stale = useApp((s) => s.stale);

  const element =
    selection && model
      ? selection.kind === 'component'
        ? model.components.find((c) => c.id === selection.id)
        : selection.kind === 'relationship'
          ? model.relationships.find((r) => r.id === selection.id)
          : selection.kind === 'group'
            ? model.groups.find((g) => g.id === selection.id)
            : undefined
      : undefined;

  if (!selection || !element || !model) {
    return (
      <aside className="props" aria-label="Thuộc tính" data-testid="property-panel">
        <h2>Thuộc tính</h2>
        <p className="props-empty">
          Chọn một phần tử trên canvas để sửa.
          <br />
          <br />
          Kéo component từ palette bên trái vào canvas; kéo từ chấm tròn ở cạnh node sang node khác
          để nối quan hệ.
        </p>
      </aside>
    );
  }

  const kind = selection.kind as Kind;
  const own = diagnostics.filter((d) => d.target?.kind === kind && d.target.id === selection.id);
  const update = (field: string, value: string | string[] | null) =>
    void useApp
      .getState()
      .dispatch({ type: 'updateField', target: { kind, id: selection.id }, field, value });

  return (
    <aside className="props" aria-label="Thuộc tính" data-testid="property-panel">
      <h2>
        {kind === 'component' ? 'Component' : kind === 'group' ? 'Group' : 'Quan hệ'}
        <button
          type="button"
          className="danger"
          onClick={() => void deleteSelection()}
          disabled={stale}
          title="Xóa (Delete)"
        >
          Xóa
        </button>
      </h2>
      <fieldset disabled={stale} key={`${kind}:${selection.id}`}>
        {kind === 'component' && (
          <ComponentFields c={element as Component} groups={model.groups} update={update} />
        )}
        {kind === 'group' && (
          <GroupFields g={element as Group} groups={model.groups} update={update} />
        )}
        {kind === 'relationship' && (
          <RelationshipFields
            r={element as Relationship}
            components={model.components}
            update={update}
          />
        )}
      </fieldset>
      {own.length > 0 && (
        <ul className="props-issues" aria-label="Lỗi của phần tử">
          {own.map((d, i) => (
            <Issue key={i} d={d} />
          ))}
        </ul>
      )}
    </aside>
  );
}

function Issue({ d }: { d: Diagnostic }) {
  return (
    <li className={d.severity}>
      {d.message}
      {d.hint && <span className="hint"> ↳ {d.hint}</span>}
    </li>
  );
}

type Update = (field: string, value: string | string[] | null) => void;

function ComponentFields({ c, groups, update }: { c: Component; groups: Group[]; update: Update }) {
  return (
    <>
      <TextField label="ID" name="id" value={c.id} onCommit={(v) => update('id', v)} mono />
      <TextField
        label="Tên"
        name="name"
        value={c.name === c.id ? '' : c.name}
        placeholder={c.id}
        onCommit={(v) => update('name', v || null)}
      />
      <TextField
        label="Loại"
        name="type"
        value={c.type}
        onCommit={(v) => update('type', v)}
        list="ac-component-types"
      />
      <TextField
        label="Công nghệ"
        name="technology"
        value={c.technology ?? ''}
        onCommit={(v) => update('technology', v || null)}
      />
      <TextField
        label="Mô tả"
        name="description"
        value={c.description ?? ''}
        onCommit={(v) => update('description', v || null)}
        multiline
      />
      <TextField
        label="Owner"
        name="owner"
        value={c.owner ?? ''}
        onCommit={(v) => update('owner', v || null)}
      />
      <SelectField
        label="Group"
        name="group"
        value={c.group ?? ''}
        options={[
          ['', '— Không thuộc group —'],
          ...groups.map((g): [string, string] => [g.id, g.name]),
        ]}
        onCommit={(v) => update('group', v || null)}
      />
      <TextField
        label="Tags"
        name="tags"
        value={c.tags.join(', ')}
        placeholder="phân cách bằng dấu phẩy"
        onCommit={(v) => update('tags', splitList(v))}
      />
      <datalist id="ac-component-types">
        {COMPONENT_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </>
  );
}

function GroupFields({ g, groups, update }: { g: Group; groups: Group[]; update: Update }) {
  return (
    <>
      <TextField label="ID" name="id" value={g.id} onCommit={(v) => update('id', v)} mono />
      <TextField label="Tên" name="name" value={g.name} onCommit={(v) => update('name', v)} />
      <TextField
        label="Loại"
        name="type"
        value={g.type ?? ''}
        placeholder="domain, cluster, trust-zone…"
        onCommit={(v) => update('type', v || null)}
      />
      <TextField
        label="Mô tả"
        name="description"
        value={g.description ?? ''}
        onCommit={(v) => update('description', v || null)}
        multiline
      />
      <SelectField
        label="Group cha"
        name="parent"
        value={g.parent ?? ''}
        options={[
          ['', '— Không có —'],
          ...groups.filter((x) => x.id !== g.id).map((x): [string, string] => [x.id, x.name]),
        ]}
        onCommit={(v) => update('parent', v || null)}
      />
    </>
  );
}

function RelationshipFields({
  r,
  components,
  update,
}: {
  r: Relationship;
  components: Component[];
  update: Update;
}) {
  const options = components.map((c): [string, string] => [
    c.id,
    c.name === c.id ? c.id : `${c.name} (${c.id})`,
  ]);
  return (
    <>
      <SelectField
        label="Từ"
        name="from"
        value={r.from}
        options={options}
        onCommit={(v) => update('from', v)}
      />
      <SelectField
        label="Đến"
        name="to"
        value={r.to}
        options={options}
        onCommit={(v) => update('to', v)}
      />
      <TextField
        label="Giao thức"
        name="type"
        value={r.type ?? ''}
        onCommit={(v) => update('type', v || null)}
        list="ac-relationship-types"
      />
      <TextField
        label="Nhãn"
        name="label"
        value={r.label ?? ''}
        onCommit={(v) => update('label', v || null)}
      />
      <TextField
        label="Mô tả"
        name="description"
        value={r.description ?? ''}
        onCommit={(v) => update('description', v || null)}
        multiline
      />
      <TextField
        label="Công nghệ"
        name="technology"
        value={r.technology ?? ''}
        onCommit={(v) => update('technology', v || null)}
      />
      <datalist id="ac-relationship-types">
        {RELATIONSHIP_TYPES.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </>
  );
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Ô nhập: sửa tự do, ghi vào YAML khi Enter hoặc rời ô; Esc để hủy. */
function TextField(props: {
  label: string;
  name: string;
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  list?: string;
  mono?: boolean;
}) {
  const [draft, setDraft] = useState(props.value);
  useEffect(() => setDraft(props.value), [props.value]);
  const commit = () => {
    if (draft.trim() !== props.value.trim() || (props.multiline && draft !== props.value))
      props.onCommit(draft);
  };
  const common = {
    id: `prop-${props.name}`,
    name: props.name,
    value: draft,
    placeholder: props.placeholder,
    className: props.mono ? 'mono' : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        setDraft(props.value);
        (e.target as HTMLElement).blur();
      } else if (e.key === 'Enter' && (!props.multiline || e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        commit();
      }
    },
  };
  return (
    <label className="field" htmlFor={common.id}>
      <span>{props.label}</span>
      {props.multiline ? (
        <textarea rows={3} {...common} />
      ) : (
        <input type="text" list={props.list} autoComplete="off" {...common} />
      )}
    </label>
  );
}

function SelectField(props: {
  label: string;
  name: string;
  value: string;
  options: [string, string][];
  onCommit: (value: string) => void;
}) {
  const options = props.options.some(([v]) => v === props.value)
    ? props.options
    : [[props.value, props.value] as [string, string], ...props.options];
  return (
    <label className="field" htmlFor={`prop-${props.name}`}>
      <span>{props.label}</span>
      <select
        id={`prop-${props.name}`}
        name={props.name}
        value={props.value}
        onChange={(e) => props.onCommit(e.target.value)}
      >
        {options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
