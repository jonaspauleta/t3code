import type { EnvironmentId } from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import { Button } from "~/components/ui/button";
import { workspaceReadFileQueryOptions } from "~/lib/workspaceReactQuery";
import { readLocalApi } from "~/localApi";
import { useWorkspaceStore } from "~/workspace/workspaceStore";

import { FileViewer } from "./FileViewer";

interface FileTabProps {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly relativePath: string;
}

export function FileTab({ environmentId, cwd, relativePath }: FileTabProps) {
  const openExternally = useCallback(() => {
    const api = readLocalApi();
    if (!api) return;
    // Construct an absolute path to the file so the file-manager editor can
    // reveal it. Forward slashes are fine on all platforms because the server
    // uses node's `path` module to normalize.
    const absolutePath = `${cwd}/${relativePath}`;
    void api.shell.openInEditor(absolutePath, "file-manager");
  }, [cwd, relativePath]);

  const setFileBuffer = useWorkspaceStore((state) => state.setFileBuffer);
  const query = useQuery(
    workspaceReadFileQueryOptions({
      environmentId,
      cwd,
      relativePath,
    }),
  );

  useEffect(() => {
    if (!query.data) return;
    const data = query.data;
    // Layer 2 fields default to empty — Phase 7 will wire them into the
    // FileTab UI and carry forward any in-progress edit state.
    const emptyLayer2 = {
      isEditMode: false,
      editorContents: null,
      cursor: null,
      diskSha256: null,
      diskSize: null,
      hasExternalChange: false,
    } as const;
    if (data._tag === "text") {
      setFileBuffer(cwd, relativePath, {
        server: {
          kind: "text",
          contents: data.contents,
          sha256: data.sha256,
          size: data.size,
        },
        ...emptyLayer2,
      });
    } else if (data._tag === "binary") {
      setFileBuffer(cwd, relativePath, {
        server: { kind: "binary", size: data.size },
        ...emptyLayer2,
      });
    } else {
      setFileBuffer(cwd, relativePath, {
        server: { kind: "tooLarge", size: data.size, limit: data.limit },
        ...emptyLayer2,
      });
    }
  }, [cwd, query.data, relativePath, setFileBuffer]);

  useEffect(() => {
    if (!query.error) return;
    setFileBuffer(cwd, relativePath, {
      server: { kind: "error", message: query.error.message },
      isEditMode: false,
      editorContents: null,
      cursor: null,
      diskSha256: null,
      diskSize: null,
      hasExternalChange: false,
    });
  }, [cwd, query.error, relativePath, setFileBuffer]);

  if (query.isLoading) {
    return <div className="p-2 text-xs text-muted-foreground">Loading {relativePath}…</div>;
  }
  if (query.isError || !query.data) {
    return (
      <div className="p-2 text-xs text-destructive">
        Failed to read {relativePath}. {query.error?.message ?? ""}
      </div>
    );
  }

  const data = query.data;
  if (data._tag === "tooLarge") {
    return (
      <div className="flex flex-col items-start gap-2 p-3 text-xs">
        <div className="font-medium">Too large to preview</div>
        <div className="text-muted-foreground">
          {relativePath} is {(data.size / (1024 * 1024)).toFixed(1)} MB. The preview limit is{" "}
          {(data.limit / (1024 * 1024)).toFixed(0)} MB.
        </div>
        <Button size="sm" variant="outline" onClick={openExternally}>
          Open externally
        </Button>
      </div>
    );
  }
  if (data._tag === "binary") {
    return (
      <div className="flex flex-col items-start gap-2 p-3 text-xs">
        <div className="font-medium">Binary file</div>
        <div className="text-muted-foreground">
          {relativePath} appears to be a binary file ({data.size.toLocaleString()} bytes) and cannot
          be previewed.
        </div>
        <Button size="sm" variant="outline" onClick={openExternally}>
          Open externally
        </Button>
      </div>
    );
  }

  return <FileViewer relativePath={relativePath} contents={data.contents} />;
}
