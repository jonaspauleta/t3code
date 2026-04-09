import { defaultKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { highlightSelectionMatches, search } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";

import { resolveLanguage } from "./resolveLanguage";

// Chrome colors (background, gutters, selection, etc.) come from t3code's
// CSS vars via the EditorView.theme below, so they auto-adapt to the
// current light/dark theme. Syntax colors use CodeMirror's
// `defaultHighlightStyle`, which is legible on both light and dark
// backgrounds — not as pretty as a dedicated dark palette, but avoids the
// previous Material-Darker override that rendered several tags in
// near-white and was invisible on light backgrounds. A proper
// theme-aware HighlightStyle (switching palettes on `prefers-color-scheme`
// or a t3code theme context) is future work.

interface FileViewerProps {
  readonly relativePath: string;
  readonly contents: string;
  readonly isEditMode: boolean;
  readonly wordWrap: boolean;
  readonly onContentChange: (next: string) => void;
  readonly onCursorChange: (cursor: { line: number; column: number } | null) => void;
}

export function FileViewer({
  relativePath,
  contents,
  isEditMode,
  wordWrap,
  onContentChange,
  onCursorChange,
}: FileViewerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [languageExtension, setLanguageExtension] = useState<Extension | null>(null);

  // Resolve the language extension whenever the file path changes.
  useEffect(() => {
    let cancelled = false;
    resolveLanguage(relativePath).then((extension) => {
      if (!cancelled) setLanguageExtension(extension);
    });
    return () => {
      cancelled = true;
    };
  }, [relativePath]);

  // Create or recreate the editor whenever the language or contents change.
  useEffect(() => {
    if (!hostRef.current) return;

    const extensions: Extension[] = [
      lineNumbers(),
      foldGutter(),
      indentOnInput(),
      bracketMatching(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      search({ top: true }),
      keymap.of(defaultKeymap),
      ...(isEditMode
        ? []
        : [EditorState.readOnly.of(true), EditorView.editable.of(false)]),
      ...(wordWrap ? [EditorView.lineWrapping] : []),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onContentChange(update.state.doc.toString());
        }
        if (update.selectionSet) {
          const head = update.state.selection.main.head;
          const line = update.state.doc.lineAt(head);
          onCursorChange({
            line: line.number,
            column: head - line.from + 1,
          });
        }
      }),
      EditorView.theme({
        "&": {
          height: "100%",
          backgroundColor: "var(--background)",
          color: "var(--foreground)",
        },
        ".cm-scroller": {
          overflow: "auto",
          fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)",
        },
        ".cm-content": {
          caretColor: "var(--foreground)",
        },
        ".cm-cursor, .cm-dropCursor": {
          borderLeftColor: "var(--foreground)",
        },
        "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
          {
            backgroundColor: "color-mix(in srgb, var(--accent) 35%, transparent)",
          },
        ".cm-gutters": {
          backgroundColor: "color-mix(in srgb, var(--muted) 30%, transparent)",
          color: "var(--muted-foreground)",
          border: "none",
        },
        ".cm-activeLineGutter": {
          backgroundColor: "color-mix(in srgb, var(--muted) 50%, transparent)",
          color: "var(--foreground)",
        },
        ".cm-activeLine": {
          backgroundColor: "color-mix(in srgb, var(--muted) 20%, transparent)",
        },
        ".cm-foldPlaceholder": {
          backgroundColor: "transparent",
          border: "none",
          color: "var(--muted-foreground)",
        },
        ".cm-searchMatch": {
          backgroundColor: "color-mix(in srgb, var(--accent) 40%, transparent)",
          outline: "1px solid var(--accent)",
        },
        ".cm-searchMatch.cm-searchMatch-selected": {
          backgroundColor: "color-mix(in srgb, var(--accent) 70%, transparent)",
        },
      }),
    ];
    if (languageExtension) {
      extensions.push(languageExtension);
    }

    const state = EditorState.create({
      doc: contents,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: hostRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [contents, languageExtension, isEditMode, wordWrap, onContentChange, onCursorChange]);

  return <div ref={hostRef} className="h-full min-h-0 w-full" />;
}
