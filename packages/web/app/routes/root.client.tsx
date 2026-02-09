'use client'

import { useState, useEffect } from 'react'
import { Link, useNavigation, useRouteError } from 'react-router'

export function GlobalNavigationLoadingBar() {
  const navigation = useNavigation()

  if (navigation.state === 'idle') return null

  return (
    <div className="h-0.5 w-full bg-primary/20 overflow-hidden fixed top-0 left-0 z-50">
      <div className="animate-progress origin-[0%_50%] w-full h-full bg-primary" />
    </div>
  )
}

export function UserNav() {
  const [user, setUser] = useState<{ username: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.user) setUser(data.user)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse-subtle" />
  }

  if (!user) {
    return (
      <div className="flex items-center gap-3">
        <Link to="/login" className="text-white/70 text-sm hover:text-white hover:no-underline transition-colors">
          Sign in
        </Link>
        <Link to="/register" className="btn-primary btn-sm hover:no-underline">
          Sign up
        </Link>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <Link to="/new" className="text-white/60 hover:text-white hover:no-underline p-1.5 rounded-md hover:bg-white/10 transition-colors" title="New repository">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </Link>
      <div className="relative">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-medium hover:bg-white/30 transition-colors ring-2 ring-transparent hover:ring-white/20"
        >
          {user.username[0].toUpperCase()}
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 mt-2 w-52 bg-surface border border-border rounded-lg shadow-xl z-50 py-1 animate-fade-in">
              <div className="px-4 py-2.5 border-b border-border">
                <p className="text-sm font-semibold text-text-primary">{user.username}</p>
              </div>
              <div className="py-1">
                <Link
                  to={`/${user.username}`}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-text-primary hover:bg-surface-secondary hover:no-underline"
                  onClick={() => setMenuOpen(false)}
                >
                  <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Your profile
                </Link>
                <Link
                  to="/new"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-text-primary hover:bg-surface-secondary hover:no-underline"
                  onClick={() => setMenuOpen(false)}
                >
                  <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  New repository
                </Link>
              </div>
              <div className="border-t border-border py-1">
                <button
                  onClick={async () => {
                    await fetch('/api/auth/logout', { method: 'POST' })
                    window.location.href = '/'
                  }}
                  className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-surface-secondary"
                >
                  <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign out
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function DumpError() {
  const error = useRouteError()
  const message =
    error instanceof Error ? error.message : 'An unexpected error occurred'
  const stack = error instanceof Error ? error.stack : undefined

  return (
    <div className="max-w-2xl mx-auto mt-16">
      <div className="bg-surface border border-danger/30 rounded-lg p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-danger mb-2">Something went wrong</h1>
        <p className="text-text-secondary mb-4">{message}</p>
        {stack && (
          <pre className="text-xs bg-surface-secondary p-4 rounded-md overflow-x-auto text-text-secondary border border-border">
            {stack}
          </pre>
        )}
        <div className="mt-4">
          <Link to="/" className="btn-secondary btn-sm">Go home</Link>
        </div>
      </div>
    </div>
  )
}
