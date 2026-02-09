import { Link } from 'react-router'
import { apiFetch } from '../lib/api'
import { timeAgo } from '../lib/time'

export default async function UserProfile({ params }: { params: { owner: string } }) {
  const { owner } = params
  const data = await apiFetch(`/api/repos/${owner}`)

  if (data.error) {
    return (
      <div className="max-w-4xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">User not found</h1>
        </div>
      </div>
    )
  }

  const repos = data.repositories || []

  return (
    <div className="max-w-4xl mx-auto mt-8">
      {/* Profile header */}
      <div className="flex items-center gap-5 mb-8">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-border flex items-center justify-center text-3xl font-bold text-primary">
          {owner[0].toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{owner}</h1>
          <p className="text-sm text-text-secondary mt-0.5">{repos.length} repositor{repos.length === 1 ? 'y' : 'ies'}</p>
        </div>
      </div>

      {/* Repository list */}
      <div className="border-t border-border pt-6">
        <h2 className="text-base font-semibold text-text-primary mb-4">Repositories</h2>
        <div className="flex flex-col gap-4">
          {repos.map((repo: { id: string; name: string; description: string | null; isPublic: boolean; updatedAt: string }) => (
            <div
              key={repo.id}
              className="bg-surface border border-border rounded-lg p-4 hover:border-border-muted transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <Link
                      to={`/${owner}/${repo.name}`}
                      className="text-base font-semibold text-text-link hover:underline"
                    >
                      {repo.name}
                    </Link>
                    <span className={`badge ${repo.isPublic ? 'badge-public' : 'badge-private'}`}>
                      {repo.isPublic ? 'Public' : 'Private'}
                    </span>
                  </div>
                  {repo.description && (
                    <p className="text-sm text-text-secondary mt-1">{repo.description}</p>
                  )}
                </div>
                {repo.updatedAt && (
                  <span className="text-xs text-text-secondary whitespace-nowrap mt-1">
                    Updated {timeAgo(repo.updatedAt)}
                  </span>
                )}
              </div>
            </div>
          ))}
          {repos.length === 0 && (
            <div className="bg-surface border border-border rounded-lg p-12 text-center">
              <svg className="w-12 h-12 mx-auto text-text-secondary mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <h3 className="text-sm font-medium text-text-primary mb-1">No repositories yet</h3>
              <p className="text-xs text-text-secondary">{owner} hasn't created any public repositories.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
