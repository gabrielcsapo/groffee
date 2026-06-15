"use client";

import { createContext, useContext } from "react";
import type { DiffComment } from "./pull-files.client";
import type { PRCommit } from "./pull-commits.client";

/* All data the PR detail layout fetches once and shares with its tab
 * children. The point of this context is that NAVIGATING BETWEEN TABS
 * never triggers a re-fetch of any of these — the parent layout's data
 * fetch runs once per visit, and children read from it via context.
 *
 * Mutable bits (pr, prBodyHtml, comments) carry their setters so a child
 * tab can edit them and the chrome above re-renders accordingly.
 */
export interface PR {
  id: string;
  number: number;
  title: string;
  body: string | null;
  status: string;
  author: string;
  authorId?: string;
  authorDisplayName?: string | null;
  authorAvatarUploadId?: string | null;
  sourceBranch: string;
  targetBranch: string;
  createdAt: string;
  mergedBy?: string | null;
  mergedAt?: string | null;
  editCount?: number;
  lastEditedAt?: string | null;
}

export interface Comment {
  id: string;
  body: string;
  bodyHtml?: string;
  author: string;
  authorId?: string;
  authorDisplayName?: string | null;
  authorAvatarUploadId?: string | null;
  createdAt: string;
  updatedAt?: string;
  editCount?: number;
  lastEditedAt?: string | null;
}

export interface DiffFile {
  oldPath: string;
  newPath: string;
  status: string;
  hunks: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
    highlightedLines?: (string | null)[];
  }>;
}

export interface PipelineRunSummary {
  id: string;
  number: number;
  status: string;
  pipelineName: string;
}

export interface PullDetailContextValue {
  owner: string;
  repo: string;
  prNumber: string;
  pr: PR | null;
  setPr: (next: PR | null | ((prev: PR | null) => PR | null)) => void;
  prBodyHtml: string;
  setPrBodyHtml: (next: string | ((prev: string) => string)) => void;
  diff: DiffFile[] | null;
  commentsList: Comment[];
  setCommentsList: (next: Comment[] | ((prev: Comment[]) => Comment[])) => void;
  diffCommentsList: DiffComment[];
  setDiffCommentsList: (next: DiffComment[] | ((prev: DiffComment[]) => DiffComment[])) => void;
  commits: PRCommit[];
  sourceHeadOid: string | null;
  pipelineRun: PipelineRunSummary | null;
  user: { username: string } | null;
}

const PullDetailContext = createContext<PullDetailContextValue | null>(null);

export const PullDetailProvider = PullDetailContext.Provider;

/**
 * Read the PR detail context. Throws if called outside a `<PullDetailProvider>` —
 * which only happens if you forget to render a child inside the
 * pull-detail layout's Outlet, in which case the error tells you exactly
 * what went wrong.
 */
export function usePullDetailContext(): PullDetailContextValue {
  const ctx = useContext(PullDetailContext);
  if (!ctx) {
    throw new Error(
      "usePullDetailContext must be used inside a <PullDetailProvider> — render this route under /pull/:n/*",
    );
  }
  return ctx;
}
