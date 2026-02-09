import { Link } from 'react-router'
import { apiFetch } from '../lib/api'

export default async function RepoBlob({ params }: { params: { owner: string; repo: string; '*': string } }) {
  const { owner, repo: repoName } = params
  const splat = params['*'] || ''

  const blobData = await apiFetch(`/api/repos/${owner}/${repoName}/blob/${splat}`)

  if (blobData.error) {
    return (
      <div className="max-w-4xl mx-auto mt-8">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-text-primary">File not found</h1>
          <p className="text-sm text-text-secondary mt-2">{blobData.error}</p>
        </div>
      </div>
    )
  }

  const { content, ref, path: filePath } = blobData
  const pathParts = filePath.split('/')
  const fileName = pathParts[pathParts.length - 1]
  const parentPath = pathParts.slice(0, -1).join('/')
  const lines = content.split('\n')
  const lineCount = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length

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

      {/* File content */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-surface-secondary border-b border-border">
          <span className="text-sm font-medium text-text-primary">{fileName}</span>
          <span className="text-xs text-text-secondary">{lineCount} lines</span>
        </div>
        <div className="overflow-x-auto">
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
        </div>
      </div>

      {/* Back link */}
      <div className="mt-4">
        <Link
          to={parentPath
            ? `/${owner}/${repoName}/tree/${ref}/${parentPath}`
            : `/${owner}/${repoName}`
          }
          className="text-sm text-text-link hover:underline"
        >
          Back to {parentPath || repoName}
        </Link>
      </div>
    </div>
  )
}
