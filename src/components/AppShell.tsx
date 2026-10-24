import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Role } from '../types';
import {
  Building2,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  Users,
  UserRound,
  Search,
  Wallet,
  FileText,
  BarChart3,
  ClipboardList,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import { Avatar, AvatarFallback } from './ui/Avatar';
import { NotificationDropdown } from './NotificationDropdown';
import { ClinicSwitcher } from './ClinicSwitcher';
import { GlobalSearch } from './GlobalSearch';
import { cn } from '../lib/utils';
import { BrandMark } from './ui/BrandMark';

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  /** Shown above the group in the sidebar; omitted for the first group. */
  title?: string;
  items: NavItem[];
}

const item = (to: string, label: string, icon: React.ElementType): NavItem => ({ to, label, icon });

const DASHBOARD = item('/', 'Dashboard', LayoutDashboard);
const APPOINTMENTS = item('/appointments', 'Appointments', CalendarDays);
const PATIENTS = item('/patients', 'Patients', UserRound);
const BILLING = item('/billing', 'Billing', Wallet);
const INVENTORY = item('/inventory', 'Inventory & lab', Package);
const MESSAGES = item('/communications', 'Messages', MessageSquare);
const REPORTS = item('/reports', 'Reports', BarChart3);
const STAFF = item('/staff', 'Staff', Users);
const CLINICS = item('/clinics', 'Clinics', Building2);
const SETTINGS = item('/settings', 'Settings', Settings);

/** Navigation grouped by what people use it for. */
const NAV: Record<Role, NavGroup[]> = {
  super_admin: [
    { items: [DASHBOARD, APPOINTMENTS, PATIENTS] },
    { title: 'Operations', items: [BILLING, INVENTORY, MESSAGES, REPORTS] },
    { title: 'Organisation', items: [CLINICS, STAFF, SETTINGS] },
  ],
  admin: [
    { items: [DASHBOARD, APPOINTMENTS, PATIENTS] },
    { title: 'Operations', items: [BILLING, MESSAGES, REPORTS] },
    { title: 'Clinic', items: [STAFF, SETTINGS] },
  ],
  dentist: [
    { items: [DASHBOARD, item('/schedule', 'My schedule', CalendarDays), PATIENTS, item('/treatments', 'Treatment plans', FileText)] },
    { title: 'Clinic', items: [BILLING, INVENTORY, MESSAGES] },
    { title: 'Account', items: [SETTINGS] },
  ],
  receptionist: [
    { items: [DASHBOARD, APPOINTMENTS, PATIENTS] },
    { title: 'Front desk', items: [BILLING, MESSAGES, INVENTORY] },
    { title: 'Account', items: [SETTINGS] },
  ],
  patient: [
    { items: [item('/', 'Home', LayoutDashboard), item('/appointments', 'Appointments', CalendarDays), item('/records', 'My records', ClipboardList), item('/bills', 'Bills', Wallet)] },
    { title: 'Account', items: [SETTINGS] },
  ],
};

/** Titles for screens that are not top-level nav items. */
const DETAIL_TITLES: Array<[RegExp, string]> = [
  [/^\/patients\/[^/]+/, 'Patient'],
  [/^\/staff\/[^/]+/, 'Staff member'],
  [/^\/clinics\/[^/]+/, 'Clinic'],
];

const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super admin',
  admin: 'Clinic admin',
  dentist: 'Dentist',
  receptionist: 'Reception',
  patient: 'Patient',
};

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem('dentassist.sidebarCollapsed') === '1';
  } catch {
    return false;
  }
}

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(readCollapsed);

  const groups = user ? NAV[user.role] : [];
  const allItems = useMemo(() => groups.flatMap(g => g.items), [groups]);

  // Bottom bar on phones: the first four destinations; everything else lives under "More".
  const bottomItems = allItems.filter(i => i.to !== '/settings').slice(0, 4);
  const moreItems = allItems.filter(i => !bottomItems.includes(i));

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname === to || location.pathname.startsWith(`${to}/`);

  const pageTitle =
    allItems.find(i => (i.to === '/' ? location.pathname === '/' : location.pathname === i.to))?.label ||
    DETAIL_TITLES.find(([re]) => re.test(location.pathname))?.[1] ||
    '';

  // Close mobile overlays after navigating.
  useEffect(() => {
    setMoreOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);

  // Escape closes mobile overlays.
  useEffect(() => {
    if (!moreOpen && !searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreOpen(false);
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen, searchOpen]);

  const toggleCollapsed = () => {
    setIsCollapsed(prev => {
      try {
        window.localStorage.setItem('dentassist.sidebarCollapsed', prev ? '0' : '1');
      } catch {
        /* preference just won't persist */
      }
      return !prev;
    });
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}` || 'DA';
  const fullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
  const isStaff = user?.role !== 'patient';

  return (
    <div className="h-[100dvh] overflow-hidden flex bg-base">
      {/* ---------- Desktop sidebar ---------- */}
      <aside
        className={cn(
          'hidden md:flex flex-col shrink-0 bg-ink text-white/80 transition-[width] duration-200 ease-out',
          isCollapsed ? 'w-[76px]' : 'w-64'
        )}
        aria-label="Main navigation"
      >
        <div className={cn('h-16 flex items-center gap-3 shrink-0', isCollapsed ? 'justify-center px-3' : 'px-5')}>
          <BrandMark />
          {!isCollapsed && (
            <div className="min-w-0 leading-tight">
              <div className="text-[15px] font-semibold text-white truncate">DentAssist</div>
              <div className="text-xs text-white/50 truncate">VisionEdge</div>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto no-scrollbar px-3 pb-4">
          {groups.map((group, gi) => (
            <div key={gi} className={cn(gi > 0 && 'mt-6')}>
              {group.title && !isCollapsed && (
                <div className="px-3 mb-1.5 text-xs font-medium text-white/40">{group.title}</div>
              )}
              {group.title && isCollapsed && <div className="mx-3 mb-2 border-t border-white/10" aria-hidden="true" />}
              <ul className="flex flex-col gap-0.5">
                {group.items.map(navItem => (
                  <li key={navItem.to}>
                    <NavLink
                      to={navItem.to}
                      end={navItem.to === '/'}
                      title={isCollapsed ? navItem.label : undefined}
                      className={({ isActive: active }) =>
                        cn(
                          'relative flex items-center gap-3 rounded-control text-sm font-medium transition-colors',
                          isCollapsed ? 'justify-center h-10' : 'px-3 h-10',
                          active ? 'bg-white/[0.09] text-white' : 'text-white/65 hover:bg-white/[0.05] hover:text-white'
                        )
                      }
                    >
                      {({ isActive: active }) => (
                        <>
                          {active && (
                            <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-accent" aria-hidden="true" />
                          )}
                          <navItem.icon className={cn('w-[18px] h-[18px] shrink-0', active && 'text-accent')} strokeWidth={1.9} />
                          {!isCollapsed && <span className="truncate">{navItem.label}</span>}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Signed-in user */}
        <div className={cn('border-t border-white/10 p-3 flex items-center gap-3', isCollapsed && 'flex-col')}>
          <Avatar className="bg-white/10">
            <AvatarFallback className="text-white">{initials}</AvatarFallback>
          </Avatar>
          {!isCollapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-sm font-medium text-white truncate">{fullName}</div>
              <div className="text-xs text-white/50 truncate">{user ? ROLE_LABEL[user.role] : ''}</div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="p-2 rounded-control text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="w-[18px] h-[18px]" />
          </button>
        </div>
        <button
          onClick={toggleCollapsed}
          className="h-10 flex items-center justify-center gap-2 border-t border-white/10 text-xs text-white/45 hover:text-white transition-colors"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <><PanelLeftClose className="w-4 h-4" /> Collapse</>}
        </button>
      </aside>

      {/* ---------- Main column ---------- */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 md:h-16 shrink-0 bg-surface/95 backdrop-blur border-b border-line flex items-center gap-3 px-4 sm:px-6 z-30">
          {/* Phones: brand + current section (pages carry their own headings) */}
          <div className="md:hidden flex items-center gap-2.5 min-w-0 flex-1">
            <BrandMark small />
            <div className="min-w-0 leading-tight">
              <div className="text-[15px] font-semibold text-text-main truncate">DentAssist</div>
              <div className="text-xs text-text-muted truncate">{pageTitle}</div>
            </div>
          </div>

          {/* Desktop: search + clinic switcher */}
          <div className="hidden md:flex items-center gap-3 flex-1 min-w-0">
            {isStaff && <GlobalSearch className="max-w-md" />}
            {user?.role === 'super_admin' && <ClinicSwitcher />}
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {isStaff && (
              <button
                onClick={() => setSearchOpen(true)}
                className="md:hidden p-2 rounded-control text-text-muted hover:text-text-main hover:bg-base"
                aria-label="Search"
              >
                <Search className="w-5 h-5" />
              </button>
            )}
            <NotificationDropdown />
            <div className="hidden md:flex items-center gap-3 pl-3 ml-1 border-l border-line">
              <div className="text-right leading-tight">
                <div className="text-sm font-medium text-text-main">{fullName}</div>
                <div className="text-xs text-text-muted">{user ? ROLE_LABEL[user.role] : ''}</div>
              </div>
              <Avatar>
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-[1440px] px-4 pt-5 pb-28 sm:px-6 sm:pt-6 md:pb-10 lg:px-8 lg:pt-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* ---------- Phones: bottom tab bar ---------- */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur border-t border-line"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Main navigation"
      >
        <ul className="grid grid-cols-5 h-16">
          {bottomItems.map(navItem => {
            const active = isActive(navItem.to);
            return (
              <li key={navItem.to}>
                <NavLink
                  to={navItem.to}
                  end={navItem.to === '/'}
                  className="h-full flex flex-col items-center justify-center gap-1"
                  aria-current={active ? 'page' : undefined}
                >
                  <span className={cn('flex items-center justify-center h-7 w-12 rounded-full transition-colors', active ? 'bg-accent/15 text-primary' : 'text-text-muted')}>
                    <navItem.icon className="w-5 h-5" strokeWidth={active ? 2.2 : 1.9} />
                  </span>
                  <span className={cn('text-[11px] leading-none truncate max-w-full px-1', active ? 'font-semibold text-primary' : 'text-text-muted')}>
                    {navItem.label.replace(/^My /, '').replace(' & lab', '')}
                  </span>
                </NavLink>
              </li>
            );
          })}
          <li>
            <button
              onClick={() => setMoreOpen(true)}
              className="w-full h-full flex flex-col items-center justify-center gap-1"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
            >
              <span className={cn('flex items-center justify-center h-7 w-12 rounded-full', moreItems.some(i => isActive(i.to)) ? 'bg-accent/15 text-primary' : 'text-text-muted')}>
                <Menu className="w-5 h-5" strokeWidth={1.9} />
              </span>
              <span className="text-[11px] leading-none text-text-muted">More</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* ---------- Phones: "More" sheet ---------- */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="More">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMoreOpen(false)} />
          <div
            className="absolute inset-x-0 bottom-0 bg-surface rounded-t-[20px] shadow-float max-h-[85dvh] overflow-y-auto"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
          >
            <div className="flex justify-center pt-2.5" aria-hidden="true">
              <span className="h-1 w-10 rounded-full bg-line" />
            </div>
            <div className="flex items-center gap-3 px-5 pt-3 pb-4 border-b border-line">
              <Avatar>
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="text-[15px] font-semibold text-text-main truncate">{fullName}</div>
                <div className="text-[13px] text-text-muted">{user ? ROLE_LABEL[user.role] : ''}</div>
              </div>
              <button onClick={() => setMoreOpen(false)} className="p-2 -mr-2 rounded-control text-text-muted" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            {user?.role === 'super_admin' && (
              <div className="px-5 py-3 border-b border-line">
                <ClinicSwitcher />
              </div>
            )}

            <ul className="px-2 py-2">
              {moreItems.map(navItem => {
                const active = isActive(navItem.to);
                return (
                  <li key={navItem.to}>
                    <NavLink
                      to={navItem.to}
                      className={cn(
                        'flex items-center gap-4 px-3 h-12 rounded-control text-[15px]',
                        active ? 'bg-accent/10 text-primary font-semibold' : 'text-text-main active:bg-base'
                      )}
                    >
                      <navItem.icon className="w-5 h-5 text-text-muted" strokeWidth={1.9} />
                      {navItem.label}
                    </NavLink>
                  </li>
                );
              })}
              <li className="mt-1 pt-1 border-t border-line">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-4 px-3 h-12 rounded-control text-[15px] text-error active:bg-error/5"
                >
                  <LogOut className="w-5 h-5" strokeWidth={1.9} />
                  Sign out
                </button>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* ---------- Phones: search ---------- */}
      {searchOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-surface flex flex-col" role="dialog" aria-modal="true" aria-label="Search">
          <div className="h-14 flex items-center gap-2 px-3 border-b border-line">
            <GlobalSearch autoFocus className="flex-1" />
            <button onClick={() => setSearchOpen(false)} className="px-2 h-10 text-sm font-medium text-primary">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
