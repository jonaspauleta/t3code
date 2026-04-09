import { AlertTriangle } from "lucide-react";

interface FileConflictBannerProps {
  readonly relativePath: string;
  readonly onKeepMine: () => void;
  readonly onReload: () => void;
}

export function FileConflictBanner({
  relativePath,
  onKeepMine,
  onReload,
}: FileConflictBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 border-b border-border bg-destructive/10 px-3 py-2 text-xs"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="font-medium">Disk version changed</div>
        <div className="text-muted-foreground">
          {relativePath} has been modified on disk while you have unsaved edits.
        </div>
        <div className="mt-1.5 flex gap-2">
          <button
            type="button"
            className="rounded-sm border border-border bg-background px-2 py-0.5 text-[11px] hover:bg-accent"
            onClick={onKeepMine}
          >
            Keep mine
          </button>
          <button
            type="button"
            className="rounded-sm border border-border bg-background px-2 py-0.5 text-[11px] hover:bg-accent"
            onClick={onReload}
          >
            Reload from disk
          </button>
        </div>
      </div>
    </div>
  );
}
