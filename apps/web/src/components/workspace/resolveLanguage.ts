import type { Extension } from "@codemirror/state";

/**
 * Map a relative path to a dynamically-imported CodeMirror 6 language extension.
 *
 * Every import is `import()` so Vite splits each language pack into its own
 * chunk, keeping the base workspace panel bundle small.
 */
export async function resolveLanguage(relativePath: string): Promise<Extension | null> {
  const match = relativePath.toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = match?.[1] ?? null;
  if (!ext) return null;

  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mjs":
    case "cjs": {
      const mod = await import("@codemirror/lang-javascript");
      return mod.javascript({
        typescript: ext === "ts" || ext === "tsx",
        jsx: ext === "tsx" || ext === "jsx",
      });
    }
    case "py": {
      const mod = await import("@codemirror/lang-python");
      return mod.python();
    }
    case "md":
    case "markdown": {
      const mod = await import("@codemirror/lang-markdown");
      return mod.markdown();
    }
    case "json": {
      const mod = await import("@codemirror/lang-json");
      return mod.json();
    }
    case "html":
    case "htm": {
      const mod = await import("@codemirror/lang-html");
      return mod.html();
    }
    case "css": {
      const mod = await import("@codemirror/lang-css");
      return mod.css();
    }
    case "yml":
    case "yaml": {
      const mod = await import("@codemirror/lang-yaml");
      return mod.yaml();
    }
    case "sql": {
      const mod = await import("@codemirror/lang-sql");
      return mod.sql();
    }
    case "rs": {
      const mod = await import("@codemirror/lang-rust");
      return mod.rust();
    }
    case "go": {
      const mod = await import("@codemirror/lang-go");
      return mod.go();
    }
    default:
      return null;
  }
}
