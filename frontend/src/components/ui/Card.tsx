import React from 'react'
import { clsx } from 'clsx'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'flat'
}

export function Card({ children, className, variant = 'default', ...props }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-xl',
        variant === 'default' && 'glass-card',
        variant === 'elevated' && 'glass-card-lg',
        variant === 'flat' && 'bg-base-800 border border-white/[0.06]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
