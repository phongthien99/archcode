import type { Diagnostic } from '@archcode/core';
import type { Diagnostic as CmDiagnostic } from '@codemirror/lint';
import type { Text } from '@codemirror/state';

/** Diagnostic của core (dòng/cột) → diagnostic của CodeMirror (offset), gạch chân tới hết token. */
export function toCmDiagnostics(doc: Text, diagnostics: Diagnostic[]): CmDiagnostic[] {
  return diagnostics.map((d) => {
    const line = doc.line(Math.min(Math.max(d.line ?? 1, 1), doc.lines));
    const from = Math.min(line.from + Math.max((d.column ?? 1) - 1, 0), line.to);
    const rest = doc.sliceString(from, line.to);
    const token = /^[^\s,}\]]+/.exec(rest)?.[0].length ?? 0;
    return {
      from,
      to: Math.max(from + token, Math.min(from + 1, line.to)),
      severity: d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warning' : 'info',
      source: d.rule ?? d.code,
      message: d.hint ? `${d.message}\n↳ ${d.hint}` : d.message,
    };
  });
}
