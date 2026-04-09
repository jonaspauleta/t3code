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
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      search({ top: true }),
      keymap.of(defaultKeymap),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.theme({
        "&": { height: "100%" },
        ".cm-scroller": { overflow: "auto", fontFamily: "var(--font-mono, monospace)" },
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
