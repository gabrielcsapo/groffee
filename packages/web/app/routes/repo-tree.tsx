import { Link } from 'react-router'
import { apiFetch } from '../lib/api'

export default async function RepoTree({ params }: { params: { owner: string; repo: string; '*': string } }) {
  const { owner, repo: repoName } = params
  const splat = params['*'] || ''

  const treeData = await apiFetch(`/api/repos/${owner}/${repoName}/tree/${splat}`)

  if (treeData.error) {
    return (
      <div className="max-w-4xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">Path not found</h1>
          <p className="text-sm text-text-secondary mt-2">{treeData.error}</p>
        </div>
      </div>
    )
  }

  const { entries, ref, path: treePath } = treeData
  const pathParts = treePath ? treePath.split('/') : []

  return (
    <div className="max-w-4xl mx-auto mt-8">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-lg mb-4">
        <Link to={`/${owner}`} className="text-text-link hover:underline">{owner}</Link>
        <span className="text-text-secondary">/</span>
        <Link to={`/${owner}/${repoName}`} className="text-text-link hover:underline">{repoName}</Link>
        <span className="text-text-secondary">/</span>
        <span className="text-text-secondary text-sm">{ref}</span>
        {pathParts.map((part: string, i: number) => {
          const partPath = pathParts.slice(0, i + 1).join('/')
          const isLast = i === pathParts.length - 1
          return (
            <span key={partPath} className="flex items-center gap-1.5">
              <span className="text-text-secondary">/</span>
              {isLast ? (
                <span className="font-semibold text-text-primary">{part}</span>
              ) : (
                <Link to={`/${owner}/${repoName}/tree/${ref}/${partPath}`} className="text-text-link hover:underline">
                  {part}
                </Link>
              )}
            </span>
          )
        })}
      </div>

      {/* File tree */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {treePath && (
              <tr className="border-b border-border hover:bg-surface-secondary">
                <td className="py-2 px-4">
                  <Link
                    to={pathParts.length > 1
                      ? `/${owner}/${repoName}/tree/${ref}/${pathParts.slice(0, -1).join('/')}`
                      : `/${owner}/${repoName}`
                    }
                    className="text-text-link hover:underline flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                    </svg>
                    ..
                  </Link>
                </td>
              </tr>
            )}
            {entries.map((entry: { name: string; path: string; type: string; oid: string }, i: number) => (
              <tr key={entry.oid} className={`hover:bg-surface-secondary ${i < entries.length - 1 || treePath ? 'border-b border-border' : ''}`}>
                <td className="py-2 px-4">
                  <Link
                    to={`/${owner}/${repoName}/${entry.type === 'tree' ? 'tree' : 'blob'}/${ref}/${entry.path}`}
                    className="text-text-link hover:underline flex items-center gap-2"
                  >
                    {entry.type === 'tree' ? (
                      <svg className="w-4 h-4 text-text-link" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                    {entry.name}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
