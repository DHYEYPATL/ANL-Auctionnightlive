import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { clsx } from 'clsx'
import { Grid, Plus, LogOut, ShieldCheck, Clock } from 'lucide-react'

function NavItem({ to, label, icon, badge }: { to: string; label: string; icon: React.ReactNode; badge?: number }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'group flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-medium transition-all duration-200 relative',
          isActive
            ? 'bg-[#f4ebe1]/10 text-cream border border-[#f4ebe1]/25 shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-blur-xl'
            : 'text-slate-400 hover:text-cream hover:bg-white/[0.04]'
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className={clsx('transition-colors', isActive ? 'text-cream' : 'text-slate-500 group-hover:text-cream-muted')}>
            {icon}
          </span>
          <span className="tracking-wide font-medium">{label}</span>
          {badge !== undefined && badge > 0 && (
            <span className="ml-auto text-[10px] bg-emerald-500/20 text-emerald-300 rounded-full px-2 py-0.5 font-mono">{badge}</span>
          )}
          {isActive && (
            <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-3.5 bg-cream rounded-full shadow-[0_0_8px_rgba(244,235,225,0.7)]" />
          )}
        </>
      )}
    </NavLink>
  )
}

export default function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [time, setTime] = useState('')

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  const isBuyer = user?.role === 'BUYER'

  const buyerNav = [
    { to: '/auctions', label: 'Auction Floor', icon: <Grid size={15} /> },
    { to: '/create', label: 'Create New RFQ', icon: <Plus size={15} /> },
  ]
  const supplierNav = [
    { to: '/auctions', label: 'Invited Auctions', icon: <Grid size={15} /> },
  ]
  const navItems = isBuyer ? buyerNav : supplierNav

  return (
    <div className="flex h-screen bg-black text-slate-100 overflow-hidden font-sans select-none relative">
      {/* Sidebar (Apple MacBook Dark Rail) */}
      <aside className="w-64 flex-shrink-0 hidden md:flex flex-col border-r border-white/[0.08] bg-[#070a11]/90 backdrop-blur-2xl z-30">
        {/* macOS Traffic Lights + Brand */}
        <div className="px-6 pt-5 pb-5 border-b border-white/[0.06]">
          {/* macOS window traffic lights */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] inline-block shadow-sm" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] inline-block shadow-sm" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f] inline-block shadow-sm" />
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>

          <div className="flex items-center gap-3">
            <img
              src="/anl-logo.jpg"
              alt="ANL"
              className="w-9 h-9 rounded-xl object-cover shadow-sm border border-white/10 flex-shrink-0"
            />
            <div>
              <p className="text-xs font-bold text-cream tracking-tight flex items-center gap-1.5 uppercase">
                AUCTION NIGHT
              </p>
              <p className="text-[10px] text-cream-muted font-mono leading-tight">British RFQ Engine</p>
            </div>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-5 space-y-1.5 overflow-y-auto">
          <p className="px-3 pb-2 text-[9px] font-mono tracking-widest text-slate-500 uppercase">
            {isBuyer ? 'BUYER TERMINAL' : 'SUPPLIER PORTAL'}
          </p>
          {navItems.map(item => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>

        {/* User Card */}
        <div className="p-3 border-t border-white/[0.06]">
          <div className="apple-glass rounded-2xl p-3 flex items-center gap-3 mb-2 border border-white/[0.08] bg-[#0d121c]/80 shadow-md">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-black flex-shrink-0 shadow-sm"
              style={{ background: 'linear-gradient(135deg, #f4ebe1 0%, #d8caa7 100%)' }}
            >
              {user?.display_name[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-cream truncate">{user?.display_name}</p>
              <p className="text-[9px] font-mono tracking-wider text-slate-400 uppercase mt-0.5">
                {user?.role}
              </p>
            </div>
          </div>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-red-300 hover:bg-red-500/[0.08] transition-all font-mono"
          >
            <LogOut size={13} />
            <span>Sign Out Terminal</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative bg-black">
        {/* Apple Dynamic Island Top Bar */}
        <header className="h-14 flex-shrink-0 border-b border-white/[0.07] bg-[#070a11]/80 backdrop-blur-2xl px-4 md:px-8 flex items-center justify-between z-20">
          <div className="flex items-center gap-3">
            <div className="md:hidden flex items-center gap-2">
              <img src="/anl-logo.jpg" alt="ANL" className="w-7 h-7 rounded-lg object-cover" />
              <span className="text-xs font-bold text-cream uppercase">ANL</span>
            </div>

            {/* Apple Dynamic Status Pill */}
            <div className="hidden sm:flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[#0d121c]/90 border border-white/[0.09] text-xs shadow-inner">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-mono tracking-wider text-cream font-medium uppercase">
                BIDDING STREAM ACTIVE
              </span>
              <span className="text-slate-600">|</span>
              <div className="flex items-center gap-1.5 text-[11px] text-cream-muted font-mono">
                <Clock size={11} className="text-slate-400" />
                <span>{time}</span>
              </div>
            </div>
          </div>

          {/* Quick Action / Protocol Indicator */}
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.06] text-[10px] font-mono text-slate-400">
              <ShieldCheck size={12} className="text-emerald-400" />
              <span>POSTGRES ATOMIC CLOCK</span>
            </div>

            {isBuyer && location.pathname !== '/create' && (
              <button
                onClick={() => navigate('/create')}
                className="w-full py-2 px-4 rounded-full bg-[#f4ebe1] hover:bg-[#eadecf] active:scale-[0.99] text-black font-semibold text-xs tracking-wide flex items-center justify-center gap-1.5 shadow-md transition-all"
              >
                <Plus size={14} className="stroke-[2.5]" />
                <span>New RFQ</span>
              </button>
            )}
          </div>
        </header>

        {/* Ambient liquid lighting backdrops matching LoginPage */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div
            className="absolute top-[-20%] left-[20%] w-[700px] h-[700px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.05) 0%, transparent 65%)' }}
          />
          <div
            className="absolute bottom-[-15%] right-[10%] w-[550px] h-[550px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(216,202,167,0.04) 0%, transparent 65%)' }}
          />
        </div>

        {/* Scrollable Page Body */}
        <div className="flex-1 overflow-y-auto pb-20 md:pb-6 relative z-10">
          <Outlet />
        </div>

        {/* Mobile Apple Dock (Bottom Floating Capsule) */}
        <div className="md:hidden fixed bottom-3 left-4 right-4 z-40">
          <div className="rounded-3xl p-1.5 flex items-center justify-around shadow-2xl border border-white/[0.1] bg-[#0d121c]/90 backdrop-blur-2xl">
            <NavLink
              to="/auctions"
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center gap-1 px-4 py-2 rounded-2xl text-[10px] font-medium transition-all',
                  isActive ? 'bg-[#f4ebe1]/15 text-cream border border-[#f4ebe1]/30 font-semibold' : 'text-slate-400'
                )
              }
            >
              <Grid size={16} />
              <span>Auctions</span>
            </NavLink>

            {isBuyer && (
              <NavLink
                to="/create"
                className={({ isActive }) =>
                  clsx(
                    'flex flex-col items-center gap-1 px-4 py-2 rounded-2xl text-[10px] font-medium transition-all',
                    isActive ? 'bg-[#f4ebe1]/15 text-cream border border-[#f4ebe1]/30 font-semibold' : 'text-slate-400'
                  )
                }
              >
                <Plus size={16} />
                <span>New RFQ</span>
              </NavLink>
            )}

            <button
              onClick={() => { logout(); navigate('/login') }}
              className="flex flex-col items-center gap-1 px-4 py-2 rounded-2xl text-[10px] font-medium text-slate-400 hover:text-red-400"
            >
              <LogOut size={16} />
              <span>Exit</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
