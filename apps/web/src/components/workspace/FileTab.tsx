import type { EnvironmentId } from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { workspaceReadFileQueryOptions } from "~/lib/workspaceReactQuery";
import { useWorkspaceStore } from "~/workspace/workspaceStore";

import { FileViewer } from "./FileViewer";

interface FileTabProps {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly relativePath: string;
}

export function FileTab({ environmentId, cwd, relativePath }: FileTabProps) {
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
    if (data._tag === "text") {
      setFileBuffer(cwd, relativePath, {
        server: {
          kind: "text",
          contents: data.contents,
          sha256: data.sha256,
          size: data.size,
        },
      });
    } else if (data._tag === "binary") {
      setFileBuffer(cwd, relativePath, {
        server: { kind: "binary", size: data.size },
      });
    } else {
      setFileBuffer(cwd, relativePath, {
        server: { kind: "tooLarge", size: data.size, limit: data.limit },
      });
    }
  }, [cwd, query.data, relativePath, setFileBuffer]);

  useEffect(() => {
    if (!query.error) return;
    setFileBuffer(cwd, relativePath, {
      server: { kind: "error", message: query.error.message },
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
      <div className="flex flex-col gap-2 p-3 text-xs">
        <div className="font-medium">Too large to preview</div>
        <div className="text-muted-foreground">
          {relativePath} is {(data.size / (1024 * 1024)).toFixed(1)} MB. The preview limit is{" "}
          {(data.limit / (1024 * 1024)).toFixed(0)} MB.
        </div>
      </div>
    );
  }
  if (data._tag === "binary") {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs">
        <div className="font-medium">Binary file</div>
        <div className="text-muted-foreground">
          {relativePath} appears to be a binary file ({data.size.toLocaleString()} bytes) and cannot
          be previewed.
        </div>
      </div>
    );
  }

  return <FileViewer relativePath={relativePath} contents={data.contents} />;
}
