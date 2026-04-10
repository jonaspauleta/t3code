import { StreamLanguage } from "@codemirror/language";
import type { Extension } from "@codemirror/state";

/**
 * Map a relative path to a dynamically-imported CodeMirror 6 language extension.
 *
 * Every import is `import()` so Vite splits each language pack into its own
 * chunk, keeping the base workspace panel bundle small. Legacy languages
 * (shell, dockerfile, etc.) are wrapped via `StreamLanguage.define`.
 */
export async function resolveLanguage(relativePath: string): Promise<Extension | null> {
  const match = relativePath.toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = match?.[1] ?? null;

  // Also check for extensionless files by name (Dockerfile, Makefile, etc.)
  if (!ext) {
    const name = relativePath.split("/").pop()?.toLowerCase() ?? "";
    return resolveByFilename(name);
  }

  switch (ext) {
    // --- JavaScript / TypeScript ---
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

    // --- Python ---
    case "py":
    case "pyw":
    case "pyi": {
      const mod = await import("@codemirror/lang-python");
      return mod.python();
    }

    // --- Markdown ---
    case "md":
    case "markdown":
    case "mdx": {
      const mod = await import("@codemirror/lang-markdown");
      return mod.markdown();
    }

    // --- JSON / JSONL ---
    case "json":
    case "jsonl":
    case "jsonc":
    case "json5":
    case "geojson":
    case "webmanifest": {
      const mod = await import("@codemirror/lang-json");
      return mod.json();
    }

    // --- HTML ---
    case "html":
    case "htm":
    case "xhtml": {
      const mod = await import("@codemirror/lang-html");
      return mod.html();
    }

    // --- CSS ---
    case "css": {
      const mod = await import("@codemirror/lang-css");
      return mod.css();
    }

    // --- YAML ---
    case "yml":
    case "yaml":
    case "neon": {
      // NEON (PHP/Nette config) is structurally similar to YAML
      const mod = await import("@codemirror/lang-yaml");
      return mod.yaml();
    }

    // --- SQL ---
    case "sql": {
      const mod = await import("@codemirror/lang-sql");
      return mod.sql();
    }

    // --- Rust ---
    case "rs": {
      const mod = await import("@codemirror/lang-rust");
      return mod.rust();
    }

    // --- Go ---
    case "go": {
      const mod = await import("@codemirror/lang-go");
      return mod.go();
    }

    // --- PHP ---
    case "php":
    case "phtml":
    case "stub": {
      const mod = await import("@codemirror/lang-php");
      return mod.php();
    }

    // --- C / C++ ---
    case "c":
    case "h":
    case "cpp":
    case "cc":
    case "cxx":
    case "hpp":
    case "hxx":
    case "m":
    case "mm": {
      const mod = await import("@codemirror/lang-cpp");
      return mod.cpp();
    }

    // --- Java ---
    case "java": {
      const mod = await import("@codemirror/lang-java");
      return mod.java();
    }

    // --- XML / SVG ---
    case "xml":
    case "svg":
    case "xsl":
    case "xsd":
    case "wsdl":
    case "plist":
    case "xaml": {
      const mod = await import("@codemirror/lang-xml");
      return mod.xml();
    }

    // --- SCSS / Sass ---
    case "scss":
    case "sass": {
      const mod = await import("@codemirror/lang-sass");
      return mod.sass();
    }

    // --- Less ---
    case "less": {
      const mod = await import("@codemirror/lang-less");
      return mod.less();
    }

    // --- Liquid (Shopify templates) ---
    case "liquid": {
      const mod = await import("@codemirror/lang-liquid");
      return mod.liquid();
    }

    // --- Shell scripts (via legacy-modes) ---
    case "sh":
    case "bash":
    case "zsh":
    case "fish":
    case "ksh": {
      const mod = await import("@codemirror/legacy-modes/mode/shell");
      return StreamLanguage.define(mod.shell);
    }

    // --- Dockerfile (via legacy-modes) ---
    case "dockerfile": {
      const mod = await import("@codemirror/legacy-modes/mode/dockerfile");
      return StreamLanguage.define(mod.dockerFile);
    }

    // --- Nginx (via legacy-modes) ---
    case "conf":
    case "nginx": {
      const mod = await import("@codemirror/legacy-modes/mode/nginx");
      return StreamLanguage.define(mod.nginx);
    }

    // --- TOML (via legacy-modes) ---
    case "toml": {
      const mod = await import("@codemirror/legacy-modes/mode/toml");
      return StreamLanguage.define(mod.toml);
    }

    // --- Diff / Patch ---
    case "diff":
    case "patch": {
      const mod = await import("@codemirror/legacy-modes/mode/diff");
      return StreamLanguage.define(mod.diff);
    }

    // --- Lua (via legacy-modes) ---
    case "lua": {
      const mod = await import("@codemirror/legacy-modes/mode/lua");
      return StreamLanguage.define(mod.lua);
    }

    // --- Ruby (via legacy-modes) ---
    case "rb":
    case "gemspec":
    case "rake": {
      const mod = await import("@codemirror/legacy-modes/mode/ruby");
      return StreamLanguage.define(mod.ruby);
    }

    // --- Perl (via legacy-modes) ---
    case "pl":
    case "pm": {
      const mod = await import("@codemirror/legacy-modes/mode/perl");
      return StreamLanguage.define(mod.perl);
    }

    // --- PowerShell (via legacy-modes) ---
    case "ps1":
    case "psm1":
    case "psd1": {
      const mod = await import("@codemirror/legacy-modes/mode/powershell");
      return StreamLanguage.define(mod.powerShell);
    }

    // --- Swift (via legacy-modes) ---
    case "swift": {
      const mod = await import("@codemirror/legacy-modes/mode/swift");
      return StreamLanguage.define(mod.swift);
    }

    // --- Kotlin ---
    case "kt":
    case "kts": {
      // Kotlin is close enough to Java for basic highlighting
      const mod = await import("@codemirror/lang-java");
      return mod.java();
    }

    // --- .env files (via shell, key=value is close enough) ---
    case "env": {
      const mod = await import("@codemirror/legacy-modes/mode/shell");
      return StreamLanguage.define(mod.shell);
    }

    // --- Apache .htaccess ---
    case "htaccess": {
      const mod = await import("@codemirror/legacy-modes/mode/nginx");
      // Nginx mode is a reasonable approximation for directive-based configs
      return StreamLanguage.define(mod.nginx);
    }

    // --- Plain text / no highlighting ---
    case "txt":
    case "log":
    case "gitignore":
    case "gitattributes":
    case "editorconfig":
    case "prettierignore":
    case "eslintignore":
    case "dockerignore":
    case "nvmrc":
      return null;

    default:
      return null;
  }
}

/** Handle extensionless files by name. */
async function resolveByFilename(name: string): Promise<Extension | null> {
  switch (name) {
    case "dockerfile": {
      const mod = await import("@codemirror/legacy-modes/mode/dockerfile");
      return StreamLanguage.define(mod.dockerFile);
    }
    case "makefile":
    case "gnumakefile": {
      const mod = await import("@codemirror/legacy-modes/mode/shell");
      return StreamLanguage.define(mod.shell);
    }
    case "gemfile":
    case "rakefile": {
      const mod = await import("@codemirror/legacy-modes/mode/ruby");
      return StreamLanguage.define(mod.ruby);
    }
    default:
      return null;
  }
}
