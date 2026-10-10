import { indentWithTab } from '@codemirror/commands';
import { yaml, yamlLanguage } from '@codemirror/lang-yaml';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import { EditorSelection } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useEffect, useRef } from 'react';
import { useApp } from '../store';
import { yamlCompletion } from './completion';
import { toCmDiagnostics } from './lint';

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', backgroundColor: 'var(--panel)', color: 'var(--fg)' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6' },
  '.cm-gutters': {
    backgroundColor: 'var(--panel)',
    color: 'var(--muted)',
    borderRight: '1px solid var(--line)',
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--hover)' },
  '.cm-cursor': { borderLeftColor: 'var(--fg)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--selection) !important',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--panel)',
    color: 'var(--fg)',
    border: '1px solid var(--line)',
  },
  '.cm-tooltip-lint': { whiteSpace: 'pre-line' },
});

export function YamlEditor() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      doc: useApp.getState().text,
      extensions: [
        basicSetup,
        yaml(),
        yamlLanguage.data.of({ autocomplete: yamlCompletion(() => useApp.getState().model) }),
        lintGutter(),
        keymap.of([indentWithTab]),
        theme,
        EditorView.contentAttributes.of({ 'aria-label': 'YAML kiến trúc', spellcheck: 'false' }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          const text = update.state.doc.toString();
          if (text !== useApp.getState().text) useApp.getState().setText(text);
        }),
      ],
    });

    const unsubscribe = useApp.subscribe((state, prev) => {
      // Nội dung thay từ bên ngoài (mở file, template).
      if (state.docVersion !== prev.docVersion && state.text !== view.state.doc.toString()) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: state.text } });
      }
      if (state.diagnostics !== prev.diagnostics) {
        view.dispatch(
          setDiagnostics(view.state, toCmDiagnostics(view.state.doc, state.diagnostics)),
        );
      }
      if (state.reveal && state.reveal !== prev.reveal) {
        const line = view.state.doc.line(Math.min(state.reveal.line, view.state.doc.lines));
        const pos = Math.min(line.from + state.reveal.column - 1, line.to);
        view.dispatch({
          selection: EditorSelection.cursor(pos),
          effects: EditorView.scrollIntoView(pos, { y: 'center' }),
        });
        view.focus();
      }
    });

    return () => {
      unsubscribe();
      view.destroy();
    };
  }, []);

  return <div className="editor" ref={host} data-testid="yaml-editor" />;
}
