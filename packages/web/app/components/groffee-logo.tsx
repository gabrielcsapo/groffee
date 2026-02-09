'use client'

import { useId } from 'react'

interface GroffeeLogoProps {
  size?: number
  className?: string
}

export function GroffeeLogo({ size = 48, className = '' }: GroffeeLogoProps) {
  const maskId = useId()

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <mask id={maskId}>
          <rect width="24" height="24" fill="white" />
          <path
            d="M8 9.8c0-.44.36-.8.8-.8h6.4c.44 0 .8.36.8.8v4.9c0 1.6-1.3 2.9-2.9 2.9h-2.2c-1.6 0-2.9-1.3-2.9-2.9v-4.9z"
            fill="black"
          />
          <path
            d="M15.6 10.6h.9c1.05 0 1.9.85 1.9 1.9v.4c0 1.05-.85 1.9-1.9 1.9h-.9v-1.2h.8c.4 0 .7-.3.7-.7v-.4c0-.4-.3-.7-.7-.7h-.8v-1.2z"
            fill="black"
          />
          <path
            d="M10.2 7.2c0-.28.22-.5.5-.5s.5.22.5.5c0 .42-.16.66-.3.88-.12.18-.2.3-.2.52 0 .28-.22.5-.5.5s-.5-.22-.5-.5c0-.42.16-.66.3-.88.12-.18.2-.3.2-.52z"
            fill="black"
          />
          <path
            d="M12 7.2c0-.28.22-.5.5-.5s.5.22.5.5c0 .42-.16.66-.3.88-.12.18-.2.3-.2.52 0 .28-.22.5-.5.5s-.5-.22-.5-.5c0-.42.16-.66.3-.88.12-.18.2-.3.2-.52z"
            fill="black"
          />
          <path
            d="M13.8 7.2c0-.28.22-.5.5-.5s.5.22.5.5c0 .42-.16.66-.3.88-.12.18-.2.3-.2.52 0 .28-.22.5-.5.5s-.5-.22-.5-.5c0-.42.16-.66.3-.88.12-.18.2-.3.2-.52z"
            fill="black"
          />
        </mask>
      </defs>
      <circle cx="12" cy="12" r="10" mask={`url(#${maskId})`} />
    </svg>
  )
}
