import { Link } from 'react-router'
import { apiFetch } from '../lib/api'

function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

export default async function RepoCommits({ params }: { params: { owner: string; repo: string; ref: string } }) {
  const { owner, repo: repoName, ref } = params

  const data = await apiFetch(`/api/repos/${owner}/${repoName}/commits/${ref}`)

  if (data.error) {
    return (
      <div className="max-w-4xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">Commits not found</h1>
          <p className="text-sm text-text-secondary mt-2">{data.error}</p>
        </div>
      </div>
    )
  }

  const commits = data.commits || []

  return (
    <div className="max-w-4xl mx-auto mt-8">
      {/* Header */}
      <div className="flex items-center gap-1.5 text-lg mb-4">
        <Link to={`/${owner}`} className="text-text-link hover:underline">{owner}</Link>
        <span className="text-text-secondary">/</span>
        <Link to={`/${owner}/${repoName}`} className="text-text-link hover:underline">{repoName}</Link>
        <span className="text-text-secondary">/</span>
        <span className="text-text-primary font-semibold">Commits</span>
      </div>

      <div className="flex items-center gap-2 mb-4 text-sm text-text-secondary">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{commits.length} commits on <strong className="text-text-primary">{ref}</strong></span>
      </div>

      {/* Commit list */}
      <div className="border border-border rounded-lg overflow-hidden">
        {commits.map((commit: {
          oid: string;
          message: string;
          author: { name: string; email: string; timestamp: number };
        }, i: number) => (
          <div key={commit.oid} className={`flex items-center justify-between gap-4 px-4 py-3 ${i < commits.length - 1 ? 'border-b border-border' : ''} hover:bg-surface-secondary`}>
            <div className="flex-1 min-w-0">
              <Link
                to={`/${owner}/${repoName}/commit/${commit.oid}`}
                className="text-sm font-medium text-text-primary hover:text-text-link hover:underline"
              >
                {commit.message.split('\n')[0]}
              </Link>
              <p className="text-xs text-text-secondary mt-0.5">
                {commit.author.name} committed {timeAgo(commit.author.timestamp)}
              </p>
            </div>
            <Link
              to={`/${owner}/${repoName}/commit/${commit.oid}`}
              className="text-xs font-mono text-text-link bg-surface-secondary border border-border rounded px-2 py-1 hover:bg-primary hover:text-white hover:no-underline"
            >
              {commit.oid.slice(0, 7)}
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
