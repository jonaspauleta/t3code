import { Schema } from "effect";
import { NonNegativeInt, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas";

const PROJECT_SEARCH_ENTRIES_MAX_LIMIT = 200;
const PROJECT_WRITE_FILE_PATH_MAX_LENGTH = 512;

export const ProjectSearchEntriesInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  query: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
  limit: PositiveInt.check(Schema.isLessThanOrEqualTo(PROJECT_SEARCH_ENTRIES_MAX_LIMIT)),
});
export type ProjectSearchEntriesInput = typeof ProjectSearchEntriesInput.Type;

const ProjectEntryKind = Schema.Literals(["file", "directory"]);

export const ProjectEntry = Schema.Struct({
  path: TrimmedNonEmptyString,
  kind: ProjectEntryKind,
  parentPath: Schema.optional(TrimmedNonEmptyString),
});
export type ProjectEntry = typeof ProjectEntry.Type;

export const ProjectSearchEntriesResult = Schema.Struct({
  entries: Schema.Array(ProjectEntry),
  truncated: Schema.Boolean,
});
export type ProjectSearchEntriesResult = typeof ProjectSearchEntriesResult.Type;

export class ProjectSearchEntriesError extends Schema.TaggedErrorClass<ProjectSearchEntriesError>()(
  "ProjectSearchEntriesError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export const ProjectWriteFileInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH)),
  contents: Schema.String,
});
export type ProjectWriteFileInput = typeof ProjectWriteFileInput.Type;

export const ProjectWriteFileResult = Schema.Struct({
  relativePath: TrimmedNonEmptyString,
});
export type ProjectWriteFileResult = typeof ProjectWriteFileResult.Type;

export class ProjectWriteFileError extends Schema.TaggedErrorClass<ProjectWriteFileError>()(
  "ProjectWriteFileError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}

// ---------- Read file (workspace Layer 1) ----------

export const PROJECT_READ_FILE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB preview limit
export const PROJECT_EDIT_FILE_MAX_BYTES = 1 * 1024 * 1024; // 1 MB edit limit (consumed in Layer 2)

export const ProjectReadFileInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH)),
});
export type ProjectReadFileInput = typeof ProjectReadFileInput.Type;

/**
 * Discriminated union result. "binary" and "tooLarge" are normal responses, not
 * errors — the UI renders them differently. Errors are reserved for real IO
 * failures (permission denied, read mid-stream, path escape).
 */
export const ProjectReadFileResult = Schema.Union([
  Schema.TaggedStruct("text", {
    contents: Schema.String,
    size: NonNegativeInt,
    sha256: Schema.String,
  }),
  Schema.TaggedStruct("binary", {
    size: NonNegativeInt,
    mime: Schema.optional(Schema.String),
  }),
  Schema.TaggedStruct("tooLarge", {
    size: NonNegativeInt,
    limit: NonNegativeInt,
  }),
]);
export type ProjectReadFileResult = typeof ProjectReadFileResult.Type;

export class ProjectReadFileError extends Schema.TaggedErrorClass<ProjectReadFileError>()(
  "ProjectReadFileError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}

// ---------- List directory (workspace Layer 1) ----------

export const PROJECT_LIST_DIRECTORY_MAX_ENTRIES = 2000;

export const ProjectListDirectoryInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: Schema.String, // "" for workspace root
  includeHidden: Schema.optional(Schema.Boolean), // default false
});
export type ProjectListDirectoryInput = typeof ProjectListDirectoryInput.Type;

export const ProjectListDirectoryResult = Schema.Struct({
  relativePath: Schema.String,
  entries: Schema.Array(ProjectEntry), // reuse existing ProjectEntry schema
  truncated: Schema.Boolean,
});
export type ProjectListDirectoryResult = typeof ProjectListDirectoryResult.Type;

export class ProjectListDirectoryError extends Schema.TaggedErrorClass<ProjectListDirectoryError>()(
  "ProjectListDirectoryError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}

// ---------- Subscribe file (workspace Layer 2) ----------

export const ProjectSubscribeFileInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH)),
});
export type ProjectSubscribeFileInput = typeof ProjectSubscribeFileInput.Type;

/**
 * Events emitted by `projects.subscribeFile`. "snapshot" is emitted on every
 * fresh subscription (including after a WebSocket reconnect) so clients always
 * have a baseline to reconcile against. "changed" is emitted after any
 * debounced filesystem write. "deleted" is emitted on unlink.
 */
export const ProjectFileEvent = Schema.Union([
  Schema.TaggedStruct("snapshot", {
    sha256: Schema.String,
    size: NonNegativeInt,
  }),
  Schema.TaggedStruct("changed", {
    sha256: Schema.String,
    size: NonNegativeInt,
  }),
  Schema.TaggedStruct("deleted", {}),
]);
export type ProjectFileEvent = typeof ProjectFileEvent.Type;

export class ProjectSubscribeFileError extends Schema.TaggedErrorClass<ProjectSubscribeFileError>()(
  "ProjectSubscribeFileError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}
