import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "~/lib/utils";

/* -------------------------------------------------------------------------- */
/*  PromptModal – a lightweight text-input dialog that replaces window.prompt  */
/* -------------------------------------------------------------------------- */

interface PromptModalProps {
  readonly title: string;
  readonly defaultValue?: string | undefined;
  readonly onSubmit: (value: string) => void;
  readonly onCancel: () => void;
}

function PromptModal({ title, defaultValue = "", onSubmit, onCancel }: PromptModalProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus & select text on mount
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit(trimmed);
    }
  }, [value, onSubmit]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleSubmit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    },
    [handleSubmit, onCancel],
  );

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) {
        onCancel();
      }
    },
    [onCancel],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/32 pt-[20vh] backdrop-blur-sm"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl border bg-popover p-4 shadow-lg">
        <label className="text-sm font-medium text-foreground">{title}</label>
        <input
          ref={inputRef}
          type="text"
          className="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-medium",
              "text-muted-foreground hover:bg-accent",
            )}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-medium",
              "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
            onClick={handleSubmit}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  usePrompt – promise-based hook: const name = await showPrompt(...)         */
/* -------------------------------------------------------------------------- */

interface PromptOptions {
  readonly title: string;
  readonly defaultValue?: string | undefined;
}

type PromptResolver = (value: string | null) => void;

/**
 * Returns `[showPrompt, PromptElement]`.
 *
 * - Call `showPrompt({ title, defaultValue? })` to open the modal. It returns a
 *   promise that resolves to the entered string, or `null` if the user cancels.
 * - Render `PromptElement` somewhere in the component tree (it is `null` when
 *   the modal is closed).
 */
export function usePrompt(): [(options: PromptOptions) => Promise<string | null>, ReactNode] {
  const [state, setState] = useState<(PromptOptions & { resolve: PromptResolver }) | null>(null);

  const showPrompt = useCallback((options: PromptOptions): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const handleSubmit = useCallback(
    (value: string) => {
      state?.resolve(value);
      setState(null);
    },
    [state],
  );

  const handleCancel = useCallback(() => {
    state?.resolve(null);
    setState(null);
  }, [state]);

  const element = state ? (
    <PromptModal
      title={state.title}
      defaultValue={state.defaultValue}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  ) : null;

  return [showPrompt, element];
}
