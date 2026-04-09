import type { EnvironmentId } from "@t3tools/contracts";

import type { WorkspaceTabId } from "~/workspace/workspaceStore";

import { FileTree } from "./FileTree";

interface FilesTreeTabProps {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly activeTab: WorkspaceTabId | null;
  readonly onSelectTab: (tab: WorkspaceTabId) => void;
}

export function FilesTreeTab({ environmentId, cwd, activeTab, onSelectTab }: FilesTreeTabProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        Files
      </div>
      <div className="min-h-0 flex-1">
        <FileTree
          environmentId={environmentId}
          cwd={cwd}
          activeTab={activeTab}
          onSelectTab={onSelectTab}
        />
      </div>
    </div>
  );
}
