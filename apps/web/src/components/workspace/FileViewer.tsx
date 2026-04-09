import { defaultKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { highlightSelectionMatches, search } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { useEffect, useRef, useState } from "react";

import { resolveLanguage } from "./resolveLanguage";

// Dark-theme syntax colors. Hand-rolled so we don't ship an extra theme
// package; the palette roughly follows Material Darker. If the user is on
// a light theme the colors are still legible, just not perfectly tuned.
const darkHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "#c792ea" },
  {
    tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName],
    color: "#eeffff",
  },
  { tag: [t.function(t.variableName), t.labelName], color: "#82aaff" },
  {
    tag: [t.color, t.constant(t.name), t.standard(t.name)],
    color: "#ffcb6b",
  },
  { tag: [t.definition(t.name), t.separator], color: "#eeffff" },
  {
    tag: [
      t.typeName,
      t.className,
      t.number,
      t.changed,
      t.annotation,
      t.modifier,
      t.self,
      t.namespace,
    ],
    color: "#f78c6c",
  },
  {
    tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)],
    color: "#89ddff",
  },
  { tag: [t.meta, t.comment], color: "#546e7a", fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "#80cbc4", textDecoration: "underline" },
  { tag: t.heading, fontWeight: "bold", color: "#82aaff" },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: "#f78c6c" },
  {
    tag: [t.processingInstruction, t.string, t.inserted],
    color: "#c3e88d",
  },
  { tag: t.invalid, color: "#f07178" },
]);

interface FileViewerProps {
  readonly relativePath: string;
  readonly contents: string;
}

export function FileViewer({ relativePath, contents }: FileViewerProps) {
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
      syntaxHighlighting(darkHighlightStyle, { fallback: true }),
      search({ top: true }),
      keymap.of(defaultKeymap),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
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
  }, [contents, languageExtension]);

  return <div ref={hostRef} className="h-full min-h-0 w-full" />;
}
