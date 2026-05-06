import { Suspense } from "react";
import { Link } from "react-flight-router/client";
import { getRepo, getRepoBlob, getRepoRefs } from "../lib/server/repos";
import { getRepoEditContext } from "../lib/server/repo-edit";
import { highlightCode, getLangFromFilename } from "../lib/highlight";
import { BranchSwitcherWrapper as BranchSwitcher } from "../components/branch-switcher-wrapper.client";
import { BlobActions } from "../components/blob-actions.client";
import { RepoAboutSidebar } from "../components/repo-about-sidebar";

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "ico",
  "bmp",
  "avif",
]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "ogg"]);

function getFileExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function RepoBlob({ params }: { params?: Record<string, string> }) {
  const { owner, repo: repoName } = params as { owner: string; repo: string };
  const splat = params!.splat || "";

  const [blobData, refsData, editCtx, repoData] = await Promise.all([
    getRepoBlob(owner, repoName, splat),
    getRepoRefs(owner, repoName),
    getRepoEditContext(owner, repoName),
    getRepo(owner, repoName),
  ]);
  const canWrite = "canWrite" in editCtx ? editCtx.canWrite : false;
  const repository = repoData.repository;

  if (blobData.error) {
    return (
      <div className="max-w-4xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">File not found</h1>
          <p className="text-sm text-text-secondary mt-2">{blobData.error}</p>
        </div>
      </div>
    );
  }

  const {
    content,
    ref,
    path: filePath,
    isBinary,
    size,
    lfsPointer,
  } = blobData as {
    content: string | null;
    ref: string;
    path: string;
    isBinary?: boolean;
    size?: number;
    lfsPointer?: { oid: string; size: number; stored: boolean };
  };
  const pathParts = filePath.split("/");
  const fileName = pathParts[pathParts.length - 1];
  const parentPath = pathParts.slice(0, -1).join("/");
  const ext = getFileExtension(fileName);
  const rawUrl = `/api/repos/${owner}/${repoName}/raw/${ref}/${filePath}`;

  const isImage = IMAGE_EXTENSIONS.has(ext);
  const isVideo = VIDEO_EXTENSIONS.has(ext);
  const isMediaPreview = isImage || isVideo;

  const branches = (refsData.refs || []).filter((r: { type: string }) => r.type === "branch");
  const tags = (refsData.refs || []).filter((r: { type: string }) => r.type === "tag");

  // For text content
  let lines: string[] = [];
  let lineCount = 0;

  if (content && !isBinary && !lfsPointer) {
    lines = content.split("\n");
    lineCount = lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
  }

  return (
    <div className="max-w-6xl mx-auto mt-8">
      <div className="flex flex-col xl:flex-row gap-8">
        <div className="flex-1 min-w-0">
          {/* Ref picker */}
          {(branches.length > 0 || tags.length > 0) && (
            <div className="mb-3">
              <BranchSwitcher
                branches={branches}
                tags={tags}
                currentRef={ref}
                basePath={`/${owner}/${repoName}`}
                mode="blob"
                path={filePath}
              />
            </div>
          )}

          {/* Breadcrumbs */}
          <div className="flex items-center gap-1.5 text-lg mb-4">
            <Link to={`/${owner}`} className="text-text-link hover:underline">
              {owner}
            </Link>
            <span className="text-text-secondary">/</span>
            <Link to={`/${owner}/${repoName}`} className="text-text-link hover:underline">
              {repoName}
            </Link>
            <span className="text-text-secondary">/</span>
            <span className="text-text-secondary text-sm">{ref}</span>
            {pathParts.map((part: string, i: number) => {
              const partPath = pathParts.slice(0, i + 1).join("/");
              const isLast = i === pathParts.length - 1;
              return (
                <span key={partPath} className="flex items-center gap-1.5">
                  <span className="text-text-secondary">/</span>
                  {isLast ? (
                    <span className="font-semibold text-text-primary">{part}</span>
                  ) : (
                    <Link
                      to={`/${owner}/${repoName}/tree/${ref}/${partPath}`}
                      className="text-text-link hover:underline"
                    >
                      {part}
                    </Link>
                  )}
                </span>
              );
            })}
          </div>

          {/* File content */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-surface-secondary border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary">{fileName}</span>
                {lfsPointer && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-500/10 text-blue-600">
                    LFS
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {/* Size + line count are nice-to-have at-a-glance metadata —
                    suppress them under sm so the action buttons stay on one
                    line without wrapping. */}
                {(lfsPointer ? true : size != null) && (
                  <span className="text-xs text-text-secondary hidden sm:inline">
                    {formatBytes(lfsPointer ? lfsPointer.size : size!)}
                  </span>
                )}
                {!isBinary && !lfsPointer && content && (
                  <span className="text-xs text-text-secondary hidden sm:inline">
                    {lineCount} lines
                  </span>
                )}
                <a
                  href={rawUrl}
                  className="text-xs text-text-link hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Raw
                </a>
                {canWrite && (
                  <BlobActions
                    owner={owner}
                    repoName={repoName}
                    refName={ref}
                    path={filePath}
                    canEdit={!isBinary && !lfsPointer && (size == null || size <= 1024 * 1024)}
                  />
                )}
              </div>
            </div>

            {/* Image preview */}
            {isImage && (
              <div className="flex items-center justify-center p-8 bg-surface">
                <img
                  src={rawUrl}
                  alt={fileName}
                  className="max-w-full max-h-[600px] rounded"
                  style={{ imageRendering: ext === "ico" || ext === "bmp" ? "pixelated" : "auto" }}
                />
              </div>
            )}

            {/* Video preview */}
            {isVideo && (
              <div className="flex items-center justify-center p-8 bg-surface">
                <video src={rawUrl} controls className="max-w-full max-h-[600px] rounded">
                  Your browser does not support the video tag.
                </video>
              </div>
            )}

            {/* LFS pointer file */}
            {lfsPointer && (
              <div className="flex flex-col items-center justify-center p-12 bg-surface text-center">
                <svg
                  className="w-12 h-12 text-text-secondary mb-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6h.1a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                  />
                </svg>
                <p className="text-sm font-medium text-text-primary">Stored with Git LFS</p>
                <p className="text-xs text-text-secondary mt-1">{formatBytes(lfsPointer.size)}</p>
                <p className="text-xs text-text-secondary mt-1 font-mono break-all max-w-md">
                  sha256:{lfsPointer.oid}
                </p>
                {lfsPointer.stored ? (
                  <a href={rawUrl} className="mt-3 btn-secondary btn-sm" download={fileName}>
                    Download
                  </a>
                ) : (
                  <p className="mt-3 text-xs text-text-secondary italic">
                    LFS object not available on this server
                  </p>
                )}
              </div>
            )}

            {/* Binary file (non-media) */}
            {isBinary && !isMediaPreview && (
              <div className="flex flex-col items-center justify-center p-12 bg-surface text-center">
                <svg
                  className="w-12 h-12 text-text-secondary mb-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <p className="text-sm text-text-primary font-medium">Binary file</p>
                {size != null && (
                  <p className="text-xs text-text-secondary mt-1">{formatBytes(size)}</p>
                )}
                <a href={rawUrl} className="mt-3 btn-secondary btn-sm" download={fileName}>
                  Download
                </a>
              </div>
            )}

            {/* Text content with syntax highlighting */}
            {content && !isBinary && !lfsPointer && (
              <div className="overflow-x-auto bg-surface">
                <Suspense fallback={<PlainTextContent lines={lines} />}>
                  <HighlightedFileContent content={content} fileName={fileName} lines={lines} />
                </Suspense>
              </div>
            )}
          </div>

          {/* Back link */}
          <div className="mt-4">
            <Link
              to={
                parentPath
                  ? `/${owner}/${repoName}/tree/${ref}/${parentPath}`
                  : `/${owner}/${repoName}`
              }
              className="text-sm text-text-link hover:underline"
            >
              Back to {parentPath || repoName}
            </Link>
          </div>
        </div>
        <RepoAboutSidebar
          owner={owner}
          repo={repoName}
          description={repository?.description ?? null}
          gitRef={ref}
        />
      </div>
    </div>
  );
}

function PlainTextContent({ lines }: { lines: string[] }) {
  return (
    <table className="w-full text-sm font-mono">
      <tbody>
        {lines.map((line: string, i: number) => (
          <tr key={i} className="hover:bg-surface-secondary">
            <td className="py-0 px-4 text-right text-text-secondary select-none w-[1%] whitespace-nowrap border-r border-border">
              {i + 1}
            </td>
            <td className="py-0 px-4 whitespace-pre text-text-primary">{line}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function HighlightedFileContent({
  content,
  fileName,
  lines,
}: {
  content: string;
  fileName: string;
  lines: string[];
}) {
  const lang = getLangFromFilename(fileName);
  const highlightedLines = lang ? await highlightCode(content, lang) : null;

  return (
    <table className="w-full text-sm font-mono">
      <tbody>
        {lines.map((line: string, i: number) => (
          <tr key={i} className="hover:bg-surface-secondary">
            <td className="py-0 px-4 text-right text-text-secondary select-none w-[1%] whitespace-nowrap border-r border-border">
              {i + 1}
            </td>
            {highlightedLines?.[i] != null ? (
              <td
                className="py-0 px-4 whitespace-pre shiki-line"
                dangerouslySetInnerHTML={{ __html: highlightedLines[i] }}
              />
            ) : (
              <td className="py-0 px-4 whitespace-pre text-text-primary">{line}</td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
