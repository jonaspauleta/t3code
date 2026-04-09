import { defaultKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { highlightSelectionMatches, search } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";

import { resolveLanguage } from "./resolveLanguage";

// Chrome colors (background, gutters, selection, etc.) come from t3code's
// CSS vars via the EditorView.theme below, so they auto-adapt to the
// current light/dark theme. Syntax colors use CodeMirror's
// `defaultHighlightStyle`, which is legible on both light and dark
// backgrounds. A proper theme-aware HighlightStyle is future work.

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    fontSize: "12px",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)",
    lineHeight: "1.5",
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
});

function readOnlyExtensions(isEditMode: boolean): Extension[] {
  return isEditMode ? [] : [EditorState.readOnly.of(true), EditorView.editable.of(false)];
}

function wordWrapExtensions(wordWrap: boolean): Extension[] {
  return wordWrap ? [EditorView.lineWrapping] : [];
}

function languageExtensions(language: Extension | null): Extension[] {
  return language ? [language] : [];
}

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

  // Compartments for extensions that can change without re-creating the editor.
  // Created once per mount and reused across renders.
  const readOnlyCompartmentRef = useRef<Compartment>(new Compartment());
  const wordWrapCompartmentRef = useRef<Compartment>(new Compartment());
  const languageCompartmentRef = useRef<Compartment>(new Compartment());

  // Callback refs so the updateListener (captured once at editor creation)
  // always calls the latest callback from the parent without re-creating the editor.
  const onContentChangeRef = useRef(onContentChange);
  const onCursorChangeRef = useRef(onCursorChange);
  onContentChangeRef.current = onContentChange;
  onCursorChangeRef.current = onCursorChange;

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

  // Create the editor ONCE per file. Re-create only when the file path changes
  // (new file = new editor instance). Content, edit mode, word wrap, and
  // language are updated via dispatch without destroying the view, so typing
  // does NOT cause the editor DOM to unmount.
  useEffect(() => {
    if (!hostRef.current) return;

    const readOnlyCompartment = readOnlyCompartmentRef.current;
    const wordWrapCompartment = wordWrapCompartmentRef.current;
    const languageCompartment = languageCompartmentRef.current;

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
      readOnlyCompartment.of(readOnlyExtensions(isEditMode)),
      wordWrapCompartment.of(wordWrapExtensions(wordWrap)),
      languageCompartment.of(languageExtensions(languageExtension)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onContentChangeRef.current(update.state.doc.toString());
        }
        if (update.selectionSet) {
          const head = update.state.selection.main.head;
          const line = update.state.doc.lineAt(head);
          onCursorChangeRef.current({
            line: line.number,
            column: head - line.from + 1,
          });
        }
      }),
      editorTheme,
    ];

    const view = new EditorView({
      state: EditorState.create({
        doc: contents,
        extensions,
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Intentionally only re-create on file change. Content / mode / wordWrap /
    // language updates flow through the compartment-reconfigure effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relativePath]);

  // External content updates (e.g. Reload from disk, initial load of a file
  // that arrived after the editor mounted with an empty doc). Skip the dispatch
  // if the CM6 doc already has the value — that means the change came from the
  // user's own typing being echoed back through the store, and re-dispatching
  // would be a no-op at best and cursor-disturbing at worst.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === contents) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: contents },
    });
  }, [contents]);

  // Reconfigure the readOnly compartment when isEditMode flips.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartmentRef.current.reconfigure(readOnlyExtensions(isEditMode)),
    });
  }, [isEditMode]);

  // Reconfigure the wordWrap compartment.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: wordWrapCompartmentRef.current.reconfigure(wordWrapExtensions(wordWrap)),
    });
  }, [wordWrap]);

  // Reconfigure the language compartment when the language extension loads.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: languageCompartmentRef.current.reconfigure(languageExtensions(languageExtension)),
    });
  }, [languageExtension]);

  return <div ref={hostRef} className="h-full min-h-0 w-full" />;
}
