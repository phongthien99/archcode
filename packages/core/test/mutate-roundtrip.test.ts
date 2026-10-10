import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyCommand, parseYaml, validate, type ArchitectureModel, type Command } from '../src';

/**
 * S4-MUT-10: mọi lệnh × mọi fixture/template.
 * - comment còn nguyên (lệnh xóa chỉ được mất comment của chính phần tử bị xóa)
 * - phần không liên quan không đổi byte nào: thay đổi chỉ nằm trong các đoạn nhỏ quanh phần tử
 * - kết quả vẫn là YAML hợp lệ và không sinh lỗi schema/ngữ nghĩa mới
 */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path: string) => readFileSync(ROOT + path, 'utf8');

const FILES: [string, string][] = [
  ['fixtures/document-platform.yaml', read('fixtures/document-platform.yaml')],
  ...readdirSync(ROOT + 'apps/web/src/templates')
    .filter((f) => f.endsWith('.yaml'))
    .map((f): [string, string] => [`templates/${f}`, read(`apps/web/src/templates/${f}`)]),
  ...readdirSync(ROOT + 'fixtures/invalid')
    .filter((f) => f !== 'syntax-error.yaml')
    .map((f): [string, string] => [`invalid/${f}`, read(`fixtures/invalid/${f}`)]),
  ['cli/warning-only.yaml', read('packages/cli/test/fixtures/warning-only.yaml')],
  [
    'nested-system.yaml',
    `# Section lồng trong system, flow style\nversion: 1\nsystem:\n  id: s # hệ thống\n  name: S\n  groups: [{ id: g, name: G }]\n  components:\n    - { id: a, type: service, group: g } # A\n    - { id: b, type: database }\n  relationships: [{ from: a, to: b, type: sql }]\nviews:\n  - { id: v, name: V, include: [a, 'group:g'] }\n`,
  ],
];

const RULE_CODES = ['forbidden-dependency', 'circular-dependency', 'orphan-component'];
const REFERENCE_CODES = ['unknown-reference', 'empty-selector', 'empty-view'];

interface Case {
  name: string;
  command: Command;
  deletes?: boolean;
}

function commandsFor(model: ArchitectureModel): Case[] {
  const cases: Case[] = [];
  const [first, second] = model.components;
  const refCount = (id: string) =>
    model.relationships.filter((r) => r.from === id || r.to === id).length +
    model.views.filter((v) => [...v.include, ...v.exclude].includes(id)).length;

  cases.push({
    name: 'addComponent',
    command: { type: 'addComponent', component: { type: 'service', name: 'Dịch vụ mới: v2' } },
  });
  if (model.groups.length) {
    cases.push({
      name: 'addComponent vào group',
      command: {
        type: 'addComponent',
        component: { type: 'cache', group: model.groups[0]!.id, tags: ['x'] },
      },
    });
  }
  if (first) {
    const c = { kind: 'component' as const, id: first.id };
    cases.push({
      name: 'updateField name',
      command: {
        type: 'updateField',
        target: c,
        field: 'name',
        value: 'Tên mới: "quote" # không phải comment',
      },
    });
    cases.push({
      name: 'updateField tags',
      command: { type: 'updateField', target: c, field: 'tags', value: ['a', 'b c'] },
    });
    cases.push({
      name: 'updateField owner',
      command: { type: 'updateField', target: c, field: 'owner', value: 'team-x' },
    });
    const busiest = [...model.components].sort((a, b) => refCount(b.id) - refCount(a.id))[0]!;
    cases.push({
      name: 'renameId component',
      command: {
        type: 'renameId',
        kind: 'component',
        from: busiest.id,
        to: `${busiest.id}-renamed`,
      },
    });
  }
  if (second) {
    cases.push({
      name: 'updateField technology',
      command: {
        type: 'updateField',
        target: { kind: 'component', id: second.id },
        field: 'technology',
        value: 'Rust 1.80',
      },
    });
  }
  const described = model.components.find((c) => c.description);
  if (described) {
    cases.push({
      name: 'updateField xóa description',
      command: {
        type: 'updateField',
        target: { kind: 'component', id: described.id },
        field: 'description',
        value: null,
      },
    });
  }
  if (model.groups.length && first) {
    const g = model.groups[model.groups.length - 1]!;
    const other = model.groups.find((x) => x.id !== first.group);
    if (other)
      cases.push({
        name: 'updateField group',
        command: {
          type: 'updateField',
          target: { kind: 'component', id: first.id },
          field: 'group',
          value: other.id,
        },
      });
    cases.push({
      name: 'renameId group',
      command: { type: 'renameId', kind: 'group', from: model.groups[0]!.id, to: 'renamed-group' },
    });
    cases.push({ name: 'deleteGroup', command: { type: 'deleteGroup', id: g.id }, deletes: true });
  }
  cases.push({ name: 'addGroup', command: { type: 'addGroup', group: { name: 'Nhóm mới' } } });

  // Quan hệ mới tới một component không có quan hệ đi ra → không tạo vòng.
  const sink = model.components.find((c) => !model.relationships.some((r) => r.from === c.id));
  const source =
    sink &&
    model.components.find(
      (c) =>
        c.id !== sink.id && !model.relationships.some((r) => r.from === c.id && r.to === sink.id),
    );
  if (sink && source) {
    cases.push({
      name: 'addRelationship',
      command: {
        type: 'addRelationship',
        relationship: { from: source.id, to: sink.id, type: 'grpc', label: 'Gọi: sync' },
      },
    });
  }
  const rel = model.relationships.find(
    (r) =>
      model.components.some((c) => c.id === r.from) && model.components.some((c) => c.id === r.to),
  );
  if (rel) {
    const other = model.components.find((c) => c.id !== rel.to && c.id !== rel.from);
    if (other)
      cases.push({
        name: 'updateRelationship',
        command: { type: 'updateRelationship', id: rel.id, to: other.id },
      });
    cases.push({
      name: 'deleteRelationship',
      command: { type: 'deleteRelationship', id: rel.id },
      deletes: true,
    });
  }
  if (model.components.length) {
    const quiet = [...model.components].sort((a, b) => refCount(a.id) - refCount(b.id))[0]!;
    cases.push({
      name: 'deleteComponent',
      command: { type: 'deleteComponent', id: quiet.id },
      deletes: true,
    });
  }
  return cases;
}

/** Comment trong YAML (bỏ qua `#` nằm trong chuỗi quote). */
function comments(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    let quote: string | null = null;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]!))) {
        out.push(line.slice(i).trim());
        break;
      }
    }
  }
  return out.sort();
}

function errorCodes(text: string): string[] {
  return validate(text)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);
}

function newCodes(before: string[], after: string[]): string[] {
  const pool = [...before];
  return after.filter((code) => {
    const i = pool.indexOf(code);
    if (i === -1) return true;
    pool.splice(i, 1);
    return false;
  });
}

describe.each(FILES)('round-trip: %s', (_name, text) => {
  const model = validate(text).model!;
  const before = errorCodes(text);
  const cases = commandsFor(model);

  it('có đủ loại lệnh để kiểm tra', () => {
    expect(cases.length).toBeGreaterThanOrEqual(5);
  });

  it.each(cases.map((c) => [c.name, c] as const))('%s', (_n, { command, deletes }) => {
    const result = applyCommand(text, command);
    if (!result.ok) throw new Error(result.error);

    // changes áp lên text gốc ra đúng text mới.
    let rebuilt = text;
    for (const c of [...result.changes].reverse())
      rebuilt = rebuilt.slice(0, c.from) + c.insert + rebuilt.slice(c.to);
    expect(rebuilt).toBe(result.text);
    expect(result.changes.length).toBeGreaterThan(0);

    // Phần không liên quan không đổi: chỉ các đoạn nhỏ bị thay.
    if (!deletes) {
      for (const c of result.changes) {
        expect(c.to - c.from).toBeLessThan(80);
        expect(c.insert.length).toBeLessThan(160);
      }
    }

    expect(parseYaml(result.text).ok).toBe(true);

    const was = comments(text);
    const now = comments(result.text);
    if (deletes) expect(newCodes(was, now)).toEqual([]);
    else expect(now).toEqual(was);

    const allowed = [...RULE_CODES, ...(result.references.length ? REFERENCE_CODES : [])];
    const added = newCodes(before, errorCodes(result.text)).filter(
      (code) => !allowed.includes(code),
    );
    expect(added).toEqual([]);
  });
});
