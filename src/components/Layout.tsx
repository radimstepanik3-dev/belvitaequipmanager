import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Truck, Wrench, CalendarRange, Settings, Cloud, HardDrive, Tag, ShoppingCart, BookOpen, Menu, X } from 'lucide-react';
import { backend, isCloud } from '../lib/backend';
import { cls } from '../lib/util';

const NAV = [
  { to: '/', label: 'Přehled', icon: LayoutDashboard, end: true },
  { to: '/prodej', label: 'Prodej', icon: Tag },
  { to: '/nakup', label: 'Nákup', icon: ShoppingCart },
  { to: '/stroje', label: 'Stroje', icon: Truck },
  { to: '/servis', label: 'Servis', icon: Wrench },
  { to: '/pujcovna', label: 'Půjčovna', icon: CalendarRange },
  { to: '/pruvodce', label: 'Průvodce nákupem', icon: BookOpen },
  { to: '/nastaveni', label: 'Nastavení', icon: Settings },
];
const MOBILE_MAIN = NAV.slice(0, 4);
const MOBILE_MORE = NAV.slice(4);

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <img src="./icon.svg" alt="" className="h-8 w-8 rounded-lg" />
      <div className="leading-tight">
        <div className="font-bold text-white">StrojPark</div>
        <div className="text-[10px] uppercase tracking-wider text-slate-400">prodej · nákup · servis</div>
      </div>
    </div>
  );
}

export function Layout() {
  const user = backend.currentUser();
  const [more, setMore] = useState(false);
  const loc = useLocation();
  useEffect(() => setMore(false), [loc.pathname, loc.search]);
  const moreActive = MOBILE_MORE.some((n) => loc.pathname.startsWith(n.to));

  return (
    <div className="min-h-screen lg:pl-60">
      {/* Boční menu – počítač / tablet na šířku */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-slate-900 px-3 py-4 lg:flex">
        <div className="px-2">
          <Logo />
        </div>
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {NAV.map((n, i) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cls(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                  i === 4 && 'mt-4',
                  isActive ? 'bg-brand-500 text-slate-900' : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                )
              }
            >
              <n.icon className="h-5 w-5" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300">
          <div className="flex items-center gap-1.5">
            {isCloud ? <Cloud className="h-3.5 w-3.5 text-emerald-400" /> : <HardDrive className="h-3.5 w-3.5 text-amber-400" />}
            {isCloud ? 'Cloud – sdíleno s týmem' : 'Lokální režim (demo)'}
          </div>
          {user && <div className="mt-1 truncate text-slate-400">{user.name}</div>}
        </div>
      </aside>

      {/* Horní lišta – mobil */}
      <header className="sticky top-0 z-20 flex items-center justify-between bg-slate-900 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] lg:hidden">
        <Logo />
        {isCloud ? <Cloud className="h-4 w-4 text-emerald-400" /> : <HardDrive className="h-4 w-4 text-amber-400" />}
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-4 sm:px-6 lg:pb-10 lg:pt-6">
        <Outlet />
      </main>

      {/* Spodní navigace – mobil: 4 hlavní sekce + „Více“ */}
      {more && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setMore(false)}>
          <div
            className="absolute inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] rounded-t-2xl bg-white p-2 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {MOBILE_MORE.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cls('flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium', isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-700')
                }
              >
                <n.icon className="h-5 w-5" />
                {n.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {MOBILE_MAIN.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              cls('flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', isActive && !more ? 'text-brand-600' : 'text-slate-500')
            }
          >
            <n.icon className="h-5 w-5" />
            {n.label}
          </NavLink>
        ))}
        <button
          onClick={() => setMore(!more)}
          className={cls('flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', more || moreActive ? 'text-brand-600' : 'text-slate-500')}
        >
          {more ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          Více
        </button>
      </nav>
    </div>
  );
}
