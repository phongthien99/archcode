// Tách riêng để main thread của web dùng được mà không kéo theo YAML parser hay Ajv.

/** File có khai báo `kind: mindmap` ở cấp gốc. Kiểm tra nhanh, không parse YAML. */
export function isMindmapSource(text: string): boolean {
  return /^kind:[ \t]*["']?mindmap["']?[ \t]*(#.*)?$/m.test(text);
}
