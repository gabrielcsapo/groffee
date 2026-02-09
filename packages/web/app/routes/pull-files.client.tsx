'use client'

import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { usePullDetailContext } from './pull-detail.client'

interface DiffFile {
  oldPath: string
  newPath: string
  status: string
  hunks: Array<{
    oldStart: number
    oldLines: number
    newStart: number
    newLines: number
    lines: string[]
  }>
}

const INITIAL_RENDER_COUNT = 20
const BATCH_SIZE = 30

// ---------------------------------------------------------------------------
// DiffFileCard — full diff rendering for a single file (memoized)
// ---------------------------------------------------------------------------

const DiffFileCard = memo(function DiffFileCard({ file }: { file: DiffFile }) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
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
  )
})

// ---------------------------------------------------------------------------
// DiffSidebar — sticky file list with search filter
// ---------------------------------------------------------------------------

function DiffSidebar({
  diff,
  fileFilter,
  setFileFilter,
  scrollToFile,
  activeFileIdx,
}: {
  diff: DiffFile[]
  fileFilter: string
  setFileFilter: (v: string) => void
  scrollToFile: (idx: number) => void
  activeFileIdx: number
}) {
  const activeRef = useRef<HTMLButtonElement>(null)

  // Auto-scroll sidebar to keep active file visible
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeFileIdx])

  const filtered = diff
    .map((file, idx) => ({ file, idx }))
    .filter(({ file }) => {
      if (!fileFilter) return true
      const path = (file.newPath || file.oldPath).toLowerCase()
      return path.includes(fileFilter.toLowerCase())
    })

  return (
    <aside className="w-64 shrink-0 hidden lg:block">
      <div className="sticky top-24 max-h-[calc(100vh-8rem)] flex flex-col border border-border rounded-lg bg-surface overflow-hidden">
        {/* Header */}
        <div className="px-3 py-2 border-b border-border bg-surface-secondary text-xs font-medium text-text-secondary">
          {diff.length} files changed
        </div>

        {/* Search */}
        <div className="p-2 border-b border-border">
          <input
            type="text"
            value={fileFilter}
            onChange={e => setFileFilter(e.target.value)}
            placeholder="Filter files..."
            className="w-full px-2 py-1.5 border border-border rounded text-xs bg-surface focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
          />
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-xs text-text-secondary text-center">
              No files match filter
            </div>
          )}
          {filtered.map(({ file, idx }) => (
            <button
              key={idx}
              ref={idx === activeFileIdx ? activeRef : undefined}
              onClick={() => scrollToFile(idx)}
              className={`w-full text-left px-3 py-1.5 text-xs font-mono truncate flex items-center gap-1.5 border-b border-border/50 ${
                idx === activeFileIdx
                  ? 'bg-primary/5 text-text-link'
                  : 'hover:bg-surface-secondary text-text-primary'
              }`}
            >
              <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                file.status === 'added' ? 'bg-success' :
                file.status === 'deleted' ? 'bg-danger' :
                'bg-yellow-500'
              }`} />
              <span className="truncate">
                {file.newPath || file.oldPath}
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// PullFilesView — main export
// ---------------------------------------------------------------------------

export function PullFilesView() {
  const { diff } = usePullDetailContext()

  const [fileFilter, setFileFilter] = useState('')
  const [renderedCount, setRenderedCount] = useState(INITIAL_RENDER_COUNT)
  const [activeFileIdx, setActiveFileIdx] = useState(0)

  // Refs for DOM elements
  const sentinelRef = useRef<HTMLDivElement>(null)
  const fileElRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  // Sentinel-based batch loading: observe a single sentinel div placed after
  // the last rendered file. When it enters the viewport, load the next batch.
  useEffect(() => {
    if (!diff || renderedCount >= diff.length) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setRenderedCount(prev => Math.min(prev + BATCH_SIZE, diff.length))
        }
      },
      { rootMargin: '300px 0px' },
    )

    if (sentinelRef.current) observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [diff, renderedCount])

  // Active file tracking — observe rendered file wrappers to highlight
  // which file the user is currently reading in the sidebar.
  useEffect(() => {
    if (!diff || diff.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute('data-file-idx'))
            if (!isNaN(idx)) setActiveFileIdx(idx)
          }
        }
      },
      { rootMargin: '-80px 0px -80% 0px', threshold: 0 },
    )

    fileElRefs.current.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [diff?.length, renderedCount])

  // Store ref for a file element (stable callback, no observation side effects)
  const storeRef = useCallback((idx: number, el: HTMLDivElement | null) => {
    if (el) fileElRefs.current.set(idx, el)
    else fileElRefs.current.delete(idx)
  }, [])

  // Scroll to a specific file — ensure it's rendered first
  const scrollToFile = useCallback((idx: number) => {
    setRenderedCount(prev => Math.max(prev, idx + 1))
    // Wait for render, then scroll
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = fileElRefs.current.get(idx)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    })
  }, [])

  if (!diff) {
    return (
      <div className="border border-border rounded-lg p-8 text-center text-text-secondary">
        No diff available.
      </div>
    )
  }

  return (
    <div className="flex gap-4">
      {/* Sidebar */}
      <DiffSidebar
        diff={diff}
        fileFilter={fileFilter}
        setFileFilter={setFileFilter}
        scrollToFile={scrollToFile}
        activeFileIdx={activeFileIdx}
      />

      {/* Main diff content — only render up to renderedCount, sentinel right after */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {diff.slice(0, renderedCount).map((file, fileIdx) => (
          <div
            key={fileIdx}
            ref={el => storeRef(fileIdx, el)}
            data-file-idx={fileIdx}
            className="scroll-mt-24"
          >
            <DiffFileCard file={file} />
          </div>
        ))}

        {/* Sentinel — placed right after last rendered file to trigger next batch */}
        {renderedCount < diff.length && (
          <div ref={sentinelRef} className="py-3 flex items-center justify-center">
            <span className="text-xs text-text-secondary">
              Loading more files... ({renderedCount} of {diff.length})
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
