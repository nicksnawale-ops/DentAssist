import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
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
  Search,
  Wallet,
  Activity,
  FileText,
  BarChart,
  ClipboardList,
  MessageSquare,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Avatar, AvatarFallback } from './ui/Avatar';
import { NotificationDropdown } from './NotificationDropdown';
import { ClinicSwitcher } from './ClinicSwitcher';
import { GlobalSearch } from './GlobalSearch';

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getNavItems = (role?: Role) => {
    if (!role) return [];
    
    const navItemsMap: Record<Role, Array<{to: string, label: string, icon: any}>> = {
      super_admin: [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/clinics', label: 'Clinics', icon: Building2 },
        { to: '/staff', label: 'Staff Directory', icon: Users },
        { to: '/appointments', label: 'All Appointments', icon: CalendarDays },
        { to: '/patients', label: 'Patient Directory', icon: Users },
        { to: '/communications', label: 'Communications', icon: MessageSquare },
        { to: '/billing', label: 'Billing Overview', icon: Wallet },
        { to: '/inventory', label: 'Inventory & Lab', icon: Package },
        { to: '/reports', label: 'Reports', icon: BarChart },
        { to: '/settings', label: 'System Settings', icon: Settings },
      ],
      admin: [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/staff', label: 'Staff Directory', icon: Users },
        { to: '/appointments', label: 'Appointments', icon: CalendarDays },
        { to: '/patients', label: 'Patients', icon: Users },
        { to: '/communications', label: 'Communications', icon: MessageSquare },
        { to: '/billing', label: 'Billing Overview', icon: Wallet },
        { to: '/reports', label: 'Reports', icon: BarChart },
        { to: '/settings', label: 'Settings', icon: Settings },
      ],
      dentist: [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/schedule', label: 'My Schedule', icon: CalendarDays },
        { to: '/patients', label: 'My Patients', icon: Users },
        { to: '/treatments', label: 'Treatment Plans', icon: FileText },
        { to: '/communications', label: 'Communications', icon: MessageSquare },
        { to: '/billing', label: 'Billing & Codes', icon: Wallet },
        { to: '/inventory', label: 'Inventory & Lab', icon: Package },
        { to: '/settings', label: 'My Settings', icon: Settings },
      ],
      receptionist: [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/appointments', label: 'Appointments', icon: CalendarDays },
        { to: '/patients', label: 'Patients', icon: Users },
        { to: '/communications', label: 'Communications', icon: MessageSquare },
        { to: '/billing', label: 'Billing & Payments', icon: Wallet },
        { to: '/inventory', label: 'Inventory & Lab', icon: Package },
        { to: '/settings', label: 'Settings', icon: Settings },
      ],
      patient: [
        { to: '/', label: 'My Dashboard', icon: LayoutDashboard },
        { to: '/appointments', label: 'My Appointments', icon: CalendarDays },
        { to: '/records', label: 'My Records', icon: ClipboardList },
        { to: '/bills', label: 'My Bills', icon: Wallet },
        { to: '/settings', label: 'Settings', icon: Settings },
      ]
    };
    return navItemsMap[role] || [];
  };

  const navItems = getNavItems(user?.role);

  const getBottomNavItems = (items: Array<{to: string, label: string, icon: any}>) => {
    const bottomNav: Array<{to: string, label: string, icon: any}> = [];
    const add = (paths: string[]) => {
      for (const p of paths) {
        const item = items.find(i => i.to === p);
        if (item) {
          bottomNav.push(item);
          return;
        }
      }
    };
    add(['/']);
    add(['/appointments', '/schedule']);
    add(['/patients', '/records']);
    add(['/billing', '/bills']);
    
    // Fill up to 4 items with remaining items
    for (const item of items) {
      if (bottomNav.length >= 4) break;
      if (!bottomNav.includes(item)) {
        bottomNav.push(item);
      }
    }
    return bottomNav;
  };

  const bottomNavItems = getBottomNavItems(navItems);

  const getShortLabel = (label: string) => {
    if (label === 'Patient Directory') return 'Patients';
    if (label === 'All Appointments') return 'Appointments';
    if (label === 'Billing Overview') return 'Billing';
    if (label === 'My Schedule') return 'Schedule';
    if (label === 'My Dashboard') return 'Dashboard';
    if (label === 'My Patients') return 'Patients';
    if (label === 'Billing & Codes') return 'Billing';
    if (label === 'Billing & Payments') return 'Billing';
    if (label === 'My Appointments') return 'Appointments';
    if (label === 'My Records') return 'Records';
    if (label === 'My Bills') return 'Bills';
    return label;
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`;
  }

  return (
    <div className="h-screen overflow-hidden flex bg-base">
      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 md:hidden" 
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 h-full bg-surface border-r border-text-muted/10 transform transition-all duration-300 ease-in-out md:translate-x-0 md:static flex-shrink-0 flex flex-col ${mobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'} ${isCollapsed ? 'md:w-24' : 'md:w-64'}`}
      >
        <div className={`h-16 flex items-center justify-between border-b border-text-muted/10 transition-all duration-300 ${isCollapsed ? 'px-3' : 'px-4'}`}>
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-8 h-8 shrink-0 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-white font-bold text-xl">V</span>
            </div>
            <span className={`text-[15px] font-bold text-text-main tracking-tight truncate transition-all duration-300 ${isCollapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-[250px]'}`}>VisionEdge DentAssist</span>
          </div>
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden md:flex p-1.5 rounded-lg text-text-muted hover:bg-base hover:text-text-main transition-colors shrink-0"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) => 
                `flex items-center gap-3 rounded-lg transition-colors font-medium text-sm group ${
                  isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2.5'
                } ${
                  isActive 
                    ? 'bg-primary/10 text-primary' 
                    : 'text-text-muted hover:bg-text-muted/5 hover:text-text-main'
                }`
              }
              title={isCollapsed ? item.label : undefined}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </div>

        <div className={`p-4 border-t border-text-muted/10 flex justify-center`}>
          <button 
            onClick={handleLogout}
            className={`flex items-center gap-3 rounded-lg transition-colors font-medium text-sm text-text-muted hover:bg-error/5 hover:text-error ${isCollapsed ? 'justify-center p-2.5 w-full' : 'px-3 py-2.5 w-full'}`}
            title={isCollapsed ? "Sign Out" : undefined}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!isCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header */}
        <header className="h-16 shrink-0 bg-surface border-b border-text-muted/10 flex items-center justify-between px-4 sm:px-6 z-30">
          <div className="flex items-center gap-4 flex-1">
            {/* Global Search */}
            <GlobalSearch />
            
            {user?.role === 'super_admin' && (
              <div className="hidden md:block">
                <ClinicSwitcher />
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
            {user?.role === 'super_admin' && (
              <div className="md:hidden">
                <ClinicSwitcher />
              </div>
            )}
            <NotificationDropdown />
            <div className="flex items-center gap-3 border-l border-text-muted/20 pl-4 sm:pl-6">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-semibold text-text-main leading-tight">
                  {user?.firstName} {user?.lastName}
                </span>
                <span className="text-xs text-text-muted capitalize">
                  {user?.role.replace('_', ' ')}
                </span>
              </div>
              <Avatar>
                <AvatarFallback>{getInitials(user?.firstName || 'S', user?.lastName || 'P')}</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-4 pb-24 sm:p-6 sm:pb-24 md:pb-6 lg:p-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav 
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-text-muted/10"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex justify-around items-center h-16">
          {bottomNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) => 
                `flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
                  isActive 
                    ? 'text-primary' 
                    : 'text-text-muted hover:text-text-main'
                }`
              }
            >
              <item.icon className="w-5 h-5" strokeWidth={2} />
              <span className="text-[10px] font-medium tracking-tight truncate w-full text-center px-1">
                {getShortLabel(item.label)}
              </span>
            </NavLink>
          ))}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
              mobileMenuOpen ? 'text-primary' : 'text-text-muted hover:text-text-main'
            }`}
          >
            <Menu className="w-5 h-5" strokeWidth={2} />
            <span className="text-[10px] font-medium tracking-tight">
              More
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}
