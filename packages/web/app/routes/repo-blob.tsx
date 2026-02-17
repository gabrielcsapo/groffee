import { Link } from "react-router";
import { apiFetch } from "../lib/api";
import { highlightCode, getLangFromFilename } from "../lib/highlight";

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

export default async function RepoBlob({
  params,
}: {
  params: { owner: string; repo: string; "*": string };
}) {
  const { owner, repo: repoName } = params;
  const splat = params["*"] || "";

  const blobData = await apiFetch(`/api/repos/${owner}/${repoName}/blob/${splat}`);

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

  const { content, ref, path: filePath, isBinary, size } = blobData;
  const pathParts = filePath.split("/");
  const fileName = pathParts[pathParts.length - 1];
  const parentPath = pathParts.slice(0, -1).join("/");
  const ext = getFileExtension(fileName);
  const rawUrl = `/api/repos/${owner}/${repoName}/raw/${ref}/${filePath}`;

  const isImage = IMAGE_EXTENSIONS.has(ext);
  const isVideo = VIDEO_EXTENSIONS.has(ext);
  const isMediaPreview = isImage || isVideo;

  // For text content
  let lines: string[] = [];
  let lineCount = 0;
  let highlightedLines: string[] | null = null;

  if (content && !isBinary) {
    lines = content.split("\n");
    lineCount = lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
    const lang = getLangFromFilename(fileName);
    highlightedLines = lang ? await highlightCode(content, lang) : null;
  }

  return (
    <div className="max-w-4xl mx-auto mt-8">
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
          <span className="text-sm font-medium text-text-primary">{fileName}</span>
          <div className="flex items-center gap-3">
            {size != null && (
              <span className="text-xs text-text-secondary">{formatBytes(size)}</span>
            )}
            {!isBinary && content && (
              <span className="text-xs text-text-secondary">{lineCount} lines</span>
            )}
            <a
              href={rawUrl}
              className="text-xs text-text-link hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Raw
            </a>
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
            <video
              src={rawUrl}
              controls
              className="max-w-full max-h-[600px] rounded"
            >
              Your browser does not support the video tag.
            </video>
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
            <a
              href={rawUrl}
              className="mt-3 btn-secondary btn-sm"
              download={fileName}
            >
              Download
            </a>
          </div>
        )}

        {/* Text content with syntax highlighting */}
        {content && !isBinary && (
          <div className="overflow-x-auto bg-surface">
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
          </div>
        )}
      </div>

      {/* Back link */}
      <div className="mt-4">
        <Link
          to={
            parentPath ? `/${owner}/${repoName}/tree/${ref}/${parentPath}` : `/${owner}/${repoName}`
          }
          className="text-sm text-text-link hover:underline"
        >
          Back to {parentPath || repoName}
        </Link>
      </div>
    </div>
  );
}
