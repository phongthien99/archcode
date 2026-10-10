import { elementAt } from '@archcode/core/canvas';
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { yaml, yamlLanguage } from '@codemirror/lang-yaml';
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { lintGutter, lintKeymap, setDiagnostics } from '@codemirror/lint';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { Annotation, EditorSelection, EditorState } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
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

/** Đánh dấu transaction đến từ store (canvas, undo/redo) để không ghi ngược lại thành "gõ phím". */
const external = Annotation.define<boolean>();

/**
 * Như `basicSetup` của CodeMirror nhưng **không có history**: undo/redo dùng lịch sử chung
 * của ứng dụng (S5-HIST-01) để Ctrl+Z hoạt động xuyên suốt editor và canvas.
 */
const setup = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ]),
];

export function YamlEditor() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cursorTimer: ReturnType<typeof setTimeout> | undefined;
    const view = new EditorView({
      parent: host.current!,
      doc: useApp.getState().text,
      extensions: [
        setup,
        yaml(),
        yamlLanguage.data.of({ autocomplete: yamlCompletion(() => useApp.getState().model) }),
        lintGutter(),
        keymap.of([indentWithTab]),
        theme,
        EditorView.contentAttributes.of({ 'aria-label': 'YAML kiến trúc', spellcheck: 'false' }),
        EditorView.updateListener.of((update) => {
          const fromStore = update.transactions.some((tr) => tr.annotation(external));
          if (update.docChanged && !fromStore) {
            useApp.getState().setText(update.state.doc.toString());
          }
          // Con trỏ nằm trong block của một phần tử → chọn phần tử đó trên canvas (S4-CANVAS-07).
          if (update.selectionSet && !fromStore && update.view.hasFocus) {
            clearTimeout(cursorTimer);
            cursorTimer = setTimeout(() => {
              const state = useApp.getState();
              if (state.text !== view.state.doc.toString()) return;
              const hit = elementAt(state.ranges, view.state.selection.main.head);
              if (hit) state.select({ kind: hit.kind, id: hit.id }, 'editor');
            }, 120);
          }
        }),
      ],
    });

    // Cho E2E đọc chính xác nội dung editor (CodeMirror chỉ render phần đang hiển thị).
    Object.defineProperty(host.current!, 'editorView', { value: view, configurable: true });

    const unsubscribe = useApp.subscribe((state, prev) => {
      // Nội dung thay hoàn toàn (mở file, template).
      if (state.docVersion !== prev.docVersion && state.text !== view.state.doc.toString()) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: state.text },
          annotations: external.of(true),
        });
      }
      // Thay đổi nhỏ từ canvas / undo-redo: một transaction, con trỏ được map theo thay đổi.
      if (state.edit && state.edit !== prev.edit) {
        const current = view.state.doc.toString();
        if (current !== state.text) {
          const { changes, cursor } = state.edit;
          let applied = false;
          try {
            const tr = view.state.update({ changes, annotations: external.of(true) });
            if (tr.newDoc.toString() === state.text) {
              view.dispatch(
                cursor === undefined
                  ? tr
                  : view.state.update({
                      changes,
                      selection: EditorSelection.cursor(cursor),
                      effects: EditorView.scrollIntoView(cursor, { y: 'nearest' }),
                      annotations: external.of(true),
                    }),
              );
              applied = true;
            }
          } catch {
            // changes không khớp với nội dung editor → thay toàn bộ.
          }
          if (!applied) {
            view.dispatch({
              changes: { from: 0, to: view.state.doc.length, insert: state.text },
              annotations: external.of(true),
            });
          }
        }
      }
      if (state.diagnostics !== prev.diagnostics) {
        view.dispatch(
          setDiagnostics(
            view.state,
            toCmDiagnostics(
              view.state.doc,
              state.diagnostics.filter((d) => !d.file),
            ),
          ),
        );
      }
      if (state.reveal && state.reveal !== prev.reveal) {
        const line = view.state.doc.line(Math.min(state.reveal.line, view.state.doc.lines));
        const pos = Math.min(line.from + state.reveal.column - 1, line.to);
        view.dispatch({
          selection: EditorSelection.cursor(pos),
          effects: EditorView.scrollIntoView(pos, { y: 'center' }),
          annotations: external.of(true),
        });
        if (state.reveal.focus) view.focus();
      }
    });

    return () => {
      clearTimeout(cursorTimer);
      unsubscribe();
      view.destroy();
    };
  }, []);

  return <div className="editor" ref={host} data-testid="yaml-editor" />;
}
