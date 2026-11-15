/**
 * Reusable Input with consistent dark glass styling.
 * HD-BID-08: inputMode prop for decimal inputs.
 */
import React from 'react'
import { clsx } from 'clsx'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export function Input({ label, error, hint, className, ...props }: InputProps) {
  return (
    <div>
      {label && (
        <label className="block text-xs text-slate-400 mb-1.5 font-medium">{label}</label>
      )}
      <input
        className={clsx(
          'w-full bg-base-700 border rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600',
          'focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors duration-150',
          error
            ? 'border-red-500/50 focus:border-red-500/50'
            : 'border-white/[0.08] focus:border-accent/50',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          className
        )}
        {...props}
      />
      {hint && !error && <p className="text-xs text-slate-600 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  )
}
