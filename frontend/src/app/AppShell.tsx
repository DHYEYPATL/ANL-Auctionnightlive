import React from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Gavel, List, PlusCircle, LogOut, Zap } from 'lucide-react'
import { clsx } from 'clsx'

export default function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const navItems =
    user?.role === 'BUYER'
      ? [
          { to: '/auctions', label: 'My Auctions', icon: List },
          { to: '/create', label: 'Create RFQ', icon: PlusCircle },
        ]
      : [{ to: '/auctions', label: 'Invited Auctions', icon: Gavel }]

  return (
    <div className="min-h-screen bg-base-900 flex">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 glass-card border-r border-white/[0.06] flex flex-col py-6 px-4">
        {/* Logo */}
        <div className="flex items-center gap-2 px-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center">
            <Zap size={16} className="text-accent" />
          </div>
          <span className="font-semibold text-white tracking-tight">ANL</span>
          <span className="text-xs text-slate-500 leading-tight">Auction Night Live</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 flex flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150',
                  isActive
                    ? 'bg-accent/15 text-accent border border-accent/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className="border-t border-white/[0.06] pt-4 mt-4">
          <div className="px-3 py-2 mb-2">
            <p className="text-xs text-slate-500">Signed in as</p>
            <p className="text-sm text-slate-300 truncate">{user?.display_name}</p>
            <span className="text-xs text-accent">{user?.role}</span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
