import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  HighlightStyle,
  bracketMatching,
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { highlightSelectionMatches, search } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { useEffect, useRef, useState } from "react";

import { useTheme } from "~/hooks/useTheme";

import { resolveLanguage } from "./resolveLanguage";

// Chrome colors (background, gutters, selection, etc.) come from t3code's
// CSS vars via the EditorView.theme below, so they auto-adapt to the
// current light/dark theme. Syntax colors use pierre-dark / pierre-light
// HighlightStyles extracted from @pierre/theme, matching the diff panel's
// Shiki themes.

const pierreDarkHighlightStyle = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#84848A" },
  { tag: [t.string, t.special(t.string)], color: "#5ecc71" },
  { tag: [t.number, t.bool], color: "#68cdf2" },
  { tag: [t.atom, t.constant(t.name)], color: "#ffd452" },
  { tag: t.keyword, color: "#ff678d" },
  { tag: [t.variableName, t.definition(t.variableName)], color: "#ffa359" },
  { tag: [t.self, t.special(t.variableName)], color: "#ffca00" },
  {
    tag: [t.function(t.variableName), t.function(t.definition(t.variableName))],
    color: "#9d6afb",
  },
  { tag: [t.typeName, t.className, t.namespace], color: "#d568ea" },
  { tag: t.operator, color: "#79797F" },
  {
    tag: [
      t.operatorKeyword,
      t.logicOperator,
      t.compareOperator,
      t.arithmeticOperator,
      t.bitwiseOperator,
    ],
    color: "#08c0ef",
  },
  { tag: [t.punctuation, t.bracket, t.separator, t.paren, t.squareBracket], color: "#79797F" },
  { tag: t.tagName, color: "#ff6762" },
  { tag: t.attributeName, color: "#61d5c0" },
  { tag: t.escape, color: "#68cdf2" },
  { tag: t.regexp, color: "#64d1db" },
  { tag: [t.propertyName, t.definition(t.propertyName)], color: "#ffa359" },
  { tag: t.heading, color: "#ff6762", fontWeight: "bold" },
  { tag: t.strong, color: "#ffd452", fontWeight: "bold" },
  { tag: t.emphasis, color: "#ff678d", fontStyle: "italic" },
  { tag: t.link, color: "#ff678d", textDecoration: "underline" },
  { tag: [t.processingInstruction, t.inserted], color: "#5ecc71" },
  { tag: t.deleted, color: "#ff2e3f" },
  { tag: t.invalid, color: "#f44747" },
  { tag: t.meta, color: "#79797F" },
]);

const pierreLightHighlightStyle = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#84848A" },
  { tag: [t.string, t.special(t.string)], color: "#199f43" },
  { tag: [t.number, t.bool], color: "#1ca1c7" },
  { tag: [t.atom, t.constant(t.name)], color: "#d5a910" },
  { tag: t.keyword, color: "#fc2b73" },
  { tag: [t.variableName, t.definition(t.variableName)], color: "#d47628" },
  { tag: [t.self, t.special(t.variableName)], color: "#d5a910" },
  {
    tag: [t.function(t.variableName), t.function(t.definition(t.variableName))],
    color: "#7b43f8",
  },
  { tag: [t.typeName, t.className, t.namespace], color: "#c635e4" },
  { tag: t.operator, color: "#79797F" },
  {
    tag: [
      t.operatorKeyword,
      t.logicOperator,
      t.compareOperator,
      t.arithmeticOperator,
      t.bitwiseOperator,
    ],
    color: "#08c0ef",
  },
  { tag: [t.punctuation, t.bracket, t.separator, t.paren, t.squareBracket], color: "#79797F" },
  { tag: t.tagName, color: "#d52c36" },
  { tag: t.attributeName, color: "#61d5c0" },
  { tag: t.escape, color: "#1ca1c7" },
  { tag: t.regexp, color: "#1ca1c7" },
  { tag: [t.propertyName, t.definition(t.propertyName)], color: "#d47628" },
  { tag: t.heading, color: "#d52c36", fontWeight: "bold" },
  { tag: t.strong, color: "#d5a910", fontWeight: "bold" },
  { tag: t.emphasis, color: "#fc2b73", fontStyle: "italic" },
  { tag: t.link, color: "#fc2b73", textDecoration: "underline" },
  { tag: [t.processingInstruction, t.inserted], color: "#199f43" },
  { tag: t.deleted, color: "#d52c36" },
  { tag: t.invalid, color: "#f44747" },
  { tag: t.meta, color: "#79797F" },
]);

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    fontSize: "13px",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: '"SF Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
    lineHeight: "1.6",
  },
  ".cm-content": {
    caretColor: "var(--foreground)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--foreground)",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    {
      backgroundColor: "color-mix(in srgb, var(--accent) 60%, transparent)",
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
  const highlightCompartmentRef = useRef<Compartment>(new Compartment());

  const { resolvedTheme } = useTheme();

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
    const highlightCompartment = highlightCompartmentRef.current;

    const extensions: Extension[] = [
      lineNumbers(),
      foldGutter(),
      indentOnInput(),
      bracketMatching(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      history(),
      highlightCompartment.of([
        syntaxHighlighting(
          resolvedTheme === "dark" ? pierreDarkHighlightStyle : pierreLightHighlightStyle,
          { fallback: true },
        ),
      ]),
      search({ top: true }),
      keymap.of([...defaultKeymap, ...historyKeymap]),
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
    // language / resolvedTheme updates flow through the compartment-reconfigure
    // effects below.
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

  // Reconfigure the highlight compartment when the theme changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: highlightCompartmentRef.current.reconfigure([
        syntaxHighlighting(
          resolvedTheme === "dark" ? pierreDarkHighlightStyle : pierreLightHighlightStyle,
          { fallback: true },
        ),
      ]),
    });
  }, [resolvedTheme]);

  return <div ref={hostRef} className="h-full min-h-0 w-full" />;
}
