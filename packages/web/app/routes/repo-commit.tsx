import { Link } from 'react-router'
import { apiFetch } from '../lib/api'

export default async function RepoCommit({ params }: { params: { owner: string; repo: string; sha: string } }) {
  const { owner, repo: repoName, sha } = params

  const data = await apiFetch(`/api/repos/${owner}/${repoName}/commit/${sha}`)

  if (data.error) {
    return (
      <div className="max-w-5xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">Commit not found</h1>
          <p className="text-sm text-text-secondary mt-2">{data.error}</p>
        </div>
      </div>
    )
  }

  const { commit, diff } = data

  return (
    <div className="max-w-5xl mx-auto mt-8">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-lg mb-4">
        <Link to={`/${owner}`} className="text-text-link hover:underline">{owner}</Link>
        <span className="text-text-secondary">/</span>
        <Link to={`/${owner}/${repoName}`} className="text-text-link hover:underline">{repoName}</Link>
        <span className="text-text-secondary">/</span>
        <span className="text-text-primary">commit</span>
        <span className="text-text-secondary">/</span>
        <span className="font-semibold text-text-primary font-mono text-sm">{sha.slice(0, 7)}</span>
      </div>

      {/* Commit info */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-6">
        <h1 className="text-xl font-semibold text-text-primary mb-2">
          {commit.message.split('\n')[0]}
        </h1>
        {commit.message.includes('\n') && (
          <pre className="text-sm text-text-secondary whitespace-pre-wrap mb-3">
            {commit.message.split('\n').slice(1).join('\n').trim()}
          </pre>
        )}
        <div className="flex items-center gap-3 text-sm text-text-secondary border-t border-border pt-3 mt-3">
          <span className="font-medium text-text-primary">{commit.author.name}</span>
          <span>committed {new Date(commit.author.timestamp * 1000).toLocaleString()}</span>
        </div>
        <div className="mt-2">
          <code className="text-xs bg-surface-secondary px-2 py-1 rounded border border-border text-text-secondary font-mono">
            {sha}
          </code>
        </div>
      </div>

      {/* Diff */}
      {diff && diff.length > 0 ? (
        <div className="flex flex-col gap-4">
          {diff.map((file: {
            oldPath: string;
            newPath: string;
            status: string;
            hunks: Array<{
              oldStart: number;
              oldLines: number;
              newStart: number;
              newLines: number;
              lines: string[];
            }>;
          }, fileIdx: number) => (
            <div key={fileIdx} className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 bg-surface-secondary border-b border-border">
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                  file.status === 'added' ? 'bg-diff-add-bg text-success' :
                  file.status === 'deleted' ? 'bg-diff-del-bg text-danger' :
                  'bg-yellow-50 text-yellow-700'
                }`}>
                  {file.status}
                </span>
                <span className="text-sm font-medium text-text-primary font-mono">
                  {file.newPath || file.oldPath}
                </span>
              </div>
              <div className="overflow-x-auto">
                {file.hunks.map((hunk, hunkIdx: number) => (
                  <div key={hunkIdx}>
                    <div className="text-xs text-text-secondary bg-primary/5 px-4 py-1 font-mono border-b border-border">
                      @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                    </div>
                    <table className="w-full text-sm font-mono">
                      <tbody>
                        {hunk.lines.map((line: string, lineIdx: number) => {
                          const isAdd = line.startsWith('+')
                          const isDel = line.startsWith('-')
                          const bg = isAdd ? 'bg-diff-add-bg' : isDel ? 'bg-diff-del-bg' : ''
                          const textColor = isAdd ? 'text-success' : isDel ? 'text-danger' : 'text-text-primary'
                          return (
                            <tr key={lineIdx} className={bg}>
                              <td className={`py-0 px-4 whitespace-pre ${textColor}`}>
                                {line}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-border rounded-lg p-8 text-center text-text-secondary">
          {commit.parents.length === 0 ? 'Initial commit — no diff available.' : 'No changes.'}
        </div>
      )}
    </div>
  )
}
