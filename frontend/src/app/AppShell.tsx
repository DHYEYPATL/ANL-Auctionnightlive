import React from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { clsx } from 'clsx'

function NavItem({ to, label, icon, badge }: { to: string; label: string; icon: React.ReactNode; badge?: number }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 relative',
          isActive
            ? 'bg-accent-muted text-accent-light font-medium shadow-glow-sm'
            : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]'
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className={clsx('transition-colors', isActive ? 'text-accent-light' : 'text-slate-600 group-hover:text-slate-400')}>
            {icon}
          </span>
          <span>{label}</span>
          {badge !== undefined && badge > 0 && (
            <span className="ml-auto text-xs bg-accent/20 text-accent-light rounded-full px-1.5 py-0.5 tabular">{badge}</span>
          )}
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-accent rounded-full" />
          )}
        </>
      )}
    </NavLink>
  )
}

export default function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const isBuyer = user?.role === 'BUYER'

  const buyerNav = [
    { to: '/auctions', label: 'All Auctions', icon: <GridIcon /> },
    { to: '/create', label: 'New Auction', icon: <PlusIcon /> },
  ]
  const supplierNav = [
    { to: '/auctions', label: 'Invited Auctions', icon: <GridIcon /> },
  ]
  const navItems = isBuyer ? buyerNav : supplierNav

  return (
    <div className="flex h-screen bg-base-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col border-r border-white/[0.05] bg-base-950/80 backdrop-blur-xl">
        {/* Logo */}
        <div className="px-5 pt-6 pb-5 border-b border-white/[0.04]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>
              <BoltIcon />
            </div>
            <div>
              <p className="text-xs font-bold text-white tracking-wide">ANL</p>
              <p className="text-[10px] text-slate-600 leading-none">Auction Night Live</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          <p className="px-3 pb-2 text-[10px] font-semibold text-slate-700 uppercase tracking-widest">
            {isBuyer ? 'Buyer' : 'Supplier'}
          </p>
          {navItems.map(item => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>

        {/* User */}
        <div className="px-3 pb-4 border-t border-white/[0.04] pt-4">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl mb-1">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>
              {user?.display_name[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-300 truncate">{user?.display_name}</p>
              <p className="text-[10px] text-slate-600">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-600 hover:text-red-400 hover:bg-red-500/[0.06] transition-all"
          >
            <LogOutIcon />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto relative">
        {/* Ambient glows */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute top-[-20%] left-[20%] w-[600px] h-[600px] rounded-full" style={{background:'radial-gradient(circle,rgba(99,102,241,0.06) 0%,transparent 70%)'}} />
          <div className="absolute bottom-[-10%] right-[10%] w-[400px] h-[400px] rounded-full" style={{background:'radial-gradient(circle,rgba(139,92,246,0.04) 0%,transparent 70%)'}} />
        </div>
        <div className="relative z-10">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

// Icon components
function BoltIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> }
function GridIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> }
function PlusIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg> }
function LogOutIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> }
