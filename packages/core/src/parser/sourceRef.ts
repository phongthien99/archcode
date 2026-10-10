import { isMap, isNode, isScalar } from 'yaml';
import type { SourceRef, YamlPath } from '../types';
import type { ParsedYaml } from './parse';

/**
 * Vị trí của giá trị tại `path` trong YAML.
 * Nếu path không tồn tại (ví dụ thiếu trường), lùi dần về node cha gần nhất.
 */
export function sourceRefOf(parsed: ParsedYaml, path: YamlPath): SourceRef | undefined {
  const p = [...path];
  for (;;) {
    const node = p.length ? parsed.doc.getIn(p, true) : parsed.doc.contents;
    if (isNode(node) && node.range) return position(parsed, node.range[0]);
    if (!p.length) return undefined;
    p.pop();
  }
}

/** Vị trí của *key* cuối cùng trong path (dùng cho lỗi trường không hỗ trợ). */
export function keyRefOf(parsed: ParsedYaml, path: YamlPath): SourceRef | undefined {
  const key = path[path.length - 1];
  const parent = parsed.doc.getIn(path.slice(0, -1), true);
  if (isMap(parent)) {
    for (const pair of parent.items) {
      if (isScalar(pair.key) && pair.key.value === key && pair.key.range) {
        return position(parsed, pair.key.range[0]);
      }
    }
  }
  return sourceRefOf(parsed, path);
}

function position(parsed: ParsedYaml, offset: number): SourceRef {
  const { line, col } = parsed.lineCounter.linePos(offset);
  return { line, column: col };
}
