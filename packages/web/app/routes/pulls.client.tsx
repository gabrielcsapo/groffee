'use client'

import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import { timeAgo } from '../lib/time'

interface PR {
  id: string
  number: number
  title: string
  status: string
  author: string
  sourceBranch: string
  targetBranch: string
  createdAt: string
}

export function PullsList({ owner, repo, initialPulls }: { owner: string; repo: string; initialPulls: PR[] }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const status = searchParams.get('status') || 'open'
  const [pulls, setPulls] = useState<PR[]>(initialPulls)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (status === 'open') {
      setPulls(initialPulls)
      return
    }
    setLoading(true)
    fetch(`/api/repos/${owner}/${repo}/pulls?status=${status}`)
      .then(r => r.json())
      .then(data => setPulls(data.pullRequests || []))
      .catch(() => setPulls([]))
      .finally(() => setLoading(false))
  }, [owner, repo, status, initialPulls])

  return (
    <div className="max-w-4xl mx-auto mt-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-surface border border-border rounded-md overflow-hidden">
          <button
            onClick={() => setSearchParams({ status: 'open' })}
            className={`text-sm px-3 py-1.5 font-medium transition-colors ${status === 'open' ? 'bg-text-primary text-white' : 'text-text-secondary hover:bg-surface-secondary'}`}
          >
            Open
          </button>
          <button
            onClick={() => setSearchParams({ status: 'closed' })}
            className={`text-sm px-3 py-1.5 font-medium transition-colors ${status === 'closed' ? 'bg-text-primary text-white' : 'text-text-secondary hover:bg-surface-secondary'}`}
          >
            Closed
          </button>
          <button
            onClick={() => setSearchParams({ status: 'merged' })}
            className={`text-sm px-3 py-1.5 font-medium transition-colors ${status === 'merged' ? 'bg-text-primary text-white' : 'text-text-secondary hover:bg-surface-secondary'}`}
          >
            Merged
          </button>
        </div>
        <Link to={`/${owner}/${repo}/pulls/new`} className="btn-primary btn-sm">
          New pull request
        </Link>
      </div>

      {loading ? (
        <div className="border border-border rounded-lg overflow-hidden bg-surface">
          {[...Array(3)].map((_, i) => (
            <div key={i} className={`px-4 py-3 ${i < 2 ? 'border-b border-border' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="skeleton w-4 h-4 rounded-full mt-0.5" />
                <div className="flex-1">
                  <div className="skeleton w-2/3 h-4 mb-1.5" />
                  <div className="skeleton w-48 h-3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : pulls.length > 0 ? (
        <div className="border border-border rounded-lg overflow-hidden bg-surface">
          {pulls.map((pr, i) => (
            <div key={pr.id} className={`px-4 py-3 ${i < pulls.length - 1 ? 'border-b border-border' : ''} hover:bg-surface-secondary transition-colors`}>
              <div className="flex items-start gap-3">
                <svg className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                  pr.status === 'open' ? 'text-success' :
                  pr.status === 'merged' ? 'text-purple-600' :
                  'text-danger'
                }`} fill="currentColor" viewBox="0 0 16 16">
                  {pr.status === 'merged' ? (
                    <path d="M5 3.254V3.25v.005a7.5 7.5 0 010 9.495v.005-.005a7.5 7.5 0 010-9.495V3.254zM4 2.5a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 014 2.5zm0 8.5a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 014 11zm8-8.5a.75.75 0 01.75.75v1.5a5.75 5.75 0 01-5.75 5.75.75.75 0 010-1.5A4.25 4.25 0 0011.25 4.75v-1.5A.75.75 0 0112 2.5z" />
                  ) : (
                    <>
                      <circle cx="5" cy="3.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="5" cy="12.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      <line x1="5" y1="6" x2="5" y2="10" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="12" cy="3.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M12 6v2c0 2-2 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    </>
                  )}
                </svg>
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/${owner}/${repo}/pull/${pr.number}`}
                    className="text-sm font-semibold text-text-primary hover:text-text-link hover:underline"
                  >
                    {pr.title}
                  </Link>
                  <p className="text-xs text-text-secondary mt-0.5">
                    #{pr.number} opened {timeAgo(pr.createdAt)} by {pr.author}
                    <span className="ml-2"><code className="px-1 py-0.5 bg-surface-secondary rounded text-xs">{pr.sourceBranch}</code> → <code className="px-1 py-0.5 bg-surface-secondary rounded text-xs">{pr.targetBranch}</code></span>
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-border rounded-lg p-12 text-center bg-surface">
          <svg className="w-12 h-12 mx-auto text-text-secondary mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          <h3 className="text-sm font-medium text-text-primary mb-1">No {status} pull requests</h3>
        </div>
      )}
    </div>
  )
}
