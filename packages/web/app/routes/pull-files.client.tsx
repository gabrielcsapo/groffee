'use client'

import { usePullDetailContext } from './pull-detail.client'

export function PullFilesView() {
  const { diff } = usePullDetailContext()

  if (!diff) {
    return (
      <div className="border border-border rounded-lg p-8 text-center text-text-secondary">
        No diff available.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {diff.map((file, fileIdx) => (
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
            {file.hunks.map((hunk, hunkIdx) => (
              <div key={hunkIdx}>
                <div className="text-xs text-text-secondary bg-primary/5 px-4 py-1 font-mono border-b border-border">
                  @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                </div>
                <table className="w-full text-sm font-mono">
                  <tbody>
                    {hunk.lines.map((line, lineIdx) => {
                      const isAdd = line.startsWith('+')
                      const isDel = line.startsWith('-')
                      const bg = isAdd ? 'bg-diff-add-bg' : isDel ? 'bg-diff-del-bg' : ''
                      const textColor = isAdd ? 'text-success' : isDel ? 'text-danger' : 'text-text-primary'
                      return (
                        <tr key={lineIdx} className={bg}>
                          <td className={`py-0 px-4 whitespace-pre ${textColor}`}>{line}</td>
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
  )
}
