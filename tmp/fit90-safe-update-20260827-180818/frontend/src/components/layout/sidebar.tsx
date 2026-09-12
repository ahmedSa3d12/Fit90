import {
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  FileText,
  HeartPulse,
  HelpCircle,
  Dumbbell,
  Landmark,
  LayoutDashboard,
  List,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Smartphone,
  Stethoscope,
  Utensils,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BrandLogo } from '@/components/brand/logo';
import { Input } from '@/components/ui/input';
import { MOS_MENU, type MosMenuItem } from '@/lib/mos-menu';
import {
  activeMosMenuPath,
  ancestorBranchKeys,
  filterMosMenu,
  hasActiveInTree,
  mosMenuLabel,
  searchMosMenu,
  toggleMosBranch,
} from '@/lib/mos-menu-utils';
import { cn } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';
import { usePermission } from '@/hooks/use-permission';
import { useWorkspace } from '@/hooks/use-permission';

const ICON_STROKE = 2.1;

const MOS_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  people: Users,
  settings: Settings,
  build: Wrench,
  category: List,
  insert_drive_file: FileText,
  admin_panel_settings: Shield,
  assignment_ind: Briefcase,
  help_outline: HelpCircle,
  calendar_month: CalendarDays,
  schedule: CalendarDays,
  medical_services: Stethoscope,
  business: Building2,
  event: CalendarDays,
  event_available: CalendarCheck,
  tune: SlidersHorizontal,
  monitor_heart: HeartPulse,
  smartphone: Smartphone,
  nutrition: Utensils,
  spa: HeartPulse,
  personal_training: Dumbbell,
  accounts: Landmark,
};

function mosIcon(name?: string): LucideIcon {
  return (name && MOS_ICONS[name]) || FileText;
}

interface SidebarMenuContextValue {
  openKeys: Set<string>;
  toggleBranch: (key: string, item: MosMenuItem) => void;
  activePath: string;
  forceOpen: boolean;
}

const SidebarMenuContext = createContext<SidebarMenuContextValue | null>(null);

function useSidebarMenu() {
  const ctx = useContext(SidebarMenuContext);
  if (!ctx) throw new Error('useSidebarMenu must be used within Sidebar');
  return ctx;
}

function SidebarHeader() {
  const { user } = useAuth();
  const { t } = useLocale();
  return (
    <div className="relative shrink-0 border-b border-white/10 px-5 py-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/10 to-transparent" />
      <div className="relative flex flex-col items-center gap-3 text-center">
        <BrandLogo variant="sidebar" className="justify-center" showText={false} />
        <div>
          <p className="text-base font-bold text-white">FIT90</p>
          <p className="mt-0.5 truncate text-[13px] font-medium text-white/70">{user?.name ?? t('common.user')}</p>
        </div>
      </div>
    </div>
  );
}

function MenuLeaf({
  item,
  activePath,
  onNavigate,
  depth = 0,
}: {
  item: MosMenuItem;
  activePath: string;
  onNavigate?: () => void;
  depth?: number;
}) {
  const { t } = useLocale();
  if (!item.path) return null;
  const active = item.path === activePath;
  const label = mosMenuLabel(t, item.key);

  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-lg py-2 text-[13.5px] transition-colors',
        depth > 0 ? 'ps-6 pe-3' : 'px-3',
        active ? 'bg-white/15 font-bold text-white' : 'font-medium text-white/70 hover:bg-white/8 hover:text-white',
      )}
    >
      {active && (
        <span className="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.65)]" aria-hidden />
      )}
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full transition-all',
          active ? 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.85)]' : 'bg-white/40 group-hover:bg-white/70',
        )}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  );
}

function MenuBranch({
  item,
  onNavigate,
  depth = 0,
}: {
  item: MosMenuItem;
  siblings: MosMenuItem[];
  onNavigate?: () => void;
  depth?: number;
}) {
  const { t } = useLocale();
  const { openKeys, toggleBranch, activePath, forceOpen } = useSidebarMenu();
  const Icon = mosIcon(item.icon);
  const children = item.children ?? [];
  const hasActive = hasActiveInTree(item, activePath);
  const expanded = forceOpen || openKeys.has(item.key);
  const label = mosMenuLabel(t, item.key);

  return (
    <div>
      <button
        type="button"
        onClick={() => toggleBranch(item.key, item)}
        aria-expanded={expanded}
        className={cn(
          'group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-bold transition-colors',
          expanded || hasActive ? 'text-white' : 'text-white/75 hover:text-white',
          depth > 0 && 'ps-4',
        )}
      >
        {item.icon ? (
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-md transition-colors',
              hasActive ? 'bg-white/18 text-white' : 'bg-white/8 text-white/80 group-hover:bg-white/14',
            )}
          >
            <Icon className="size-[15px]" strokeWidth={ICON_STROKE} />
          </span>
        ) : (
          <span className="size-1.5 shrink-0 rounded-full bg-white/50" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate text-start">{label}</span>
        {hasActive && !expanded && <span className="size-1.5 shrink-0 rounded-full bg-white/80" aria-hidden />}
        <ChevronDown
          className={cn('size-3.5 shrink-0 text-white/50 transition-transform duration-200', expanded && 'rotate-180')}
        />
      </button>

      {expanded && (
        <div className={cn('mt-0.5 space-y-0.5 border-s border-white/10 ps-2', depth === 0 ? 'ms-4 me-2' : 'ms-6 me-1')}>
          {children.map((child) => (
            <MenuNode key={child.key || child.path} item={child} siblings={children} onNavigate={onNavigate} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function MenuNode({
  item,
  siblings,
  activePath: activePathProp,
  onNavigate,
  depth = 0,
}: {
  item: MosMenuItem;
  siblings: MosMenuItem[];
  activePath?: string;
  onNavigate?: () => void;
  depth?: number;
}) {
  const { activePath: ctxActivePath } = useSidebarMenu();
  const activePath = activePathProp ?? ctxActivePath;

  if (item.children?.length) {
    return <MenuBranch item={item} siblings={siblings} onNavigate={onNavigate} depth={depth} />;
  }

  return <MenuLeaf item={item} activePath={activePath} onNavigate={onNavigate} depth={depth} />;
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname, search } = useLocation();
  const { t } = useLocale();
  const { user } = useAuth();
  const { canRoute, isReady } = usePermission();
  const { data: workspace } = useWorkspace();
  const [searchQuery, setSearchQuery] = useState('');
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());

  const labelOf = useCallback((key: string) => mosMenuLabel(t, key), [t]);

  const menuRoot = useMemo<MosMenuItem[]>(
    () =>
      user?.level === 2
        ? [{ key: 'myDashboard', icon: 'dashboard', path: workspace?.homeRoute ?? '/profile' }]
        : MOS_MENU,
    [user?.level, workspace?.homeRoute],
  );

  const menu = useMemo(() => {
    const base = user?.level === 2 ? menuRoot : isReady ? filterMosMenu(menuRoot, canRoute) : menuRoot;
    return searchMosMenu(base, searchQuery, labelOf);
  }, [canRoute, isReady, searchQuery, labelOf, menuRoot, user?.level]);

  const activePath = activeMosMenuPath(pathname, menuRoot, search);
  const searching = searchQuery.trim().length > 0;

  useEffect(() => {
    setOpenKeys(new Set(ancestorBranchKeys(activePath, menuRoot)));
  }, [activePath, menuRoot]);

  const toggleBranch = useCallback(
    (key: string, item: MosMenuItem) => {
      setOpenKeys((prev) => toggleMosBranch(prev, key, item, activePath, menuRoot));
    },
    [activePath, menuRoot],
  );

  const menuCtx = useMemo<SidebarMenuContextValue>(
    () => ({
      openKeys,
      toggleBranch,
      activePath,
      forceOpen: searching,
    }),
    [openKeys, toggleBranch, activePath, searching],
  );

  return (
    <aside className="sidebar-shell flex h-full w-[288px] shrink-0 flex-col">
      <SidebarHeader />

      <SidebarMenuContext.Provider value={menuCtx}>
        <nav className="sidebar-scroll flex flex-1 flex-col overflow-y-auto px-3 py-4">
          <div className="relative mb-3">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('nav.searchMenu')}
              className="h-9 border-0 bg-white ps-9 text-[13px] text-gray-900 shadow-sm placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-white/40 dark:bg-white dark:text-gray-900 dark:placeholder:text-gray-400"
            />
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          </div>

          <div className="space-y-0.5">
            {menu.map((item) => (
              <MenuNode key={item.key} item={item} siblings={menu} onNavigate={onNavigate} />
            ))}
          </div>
        </nav>
      </SidebarMenuContext.Provider>

      <div className="shrink-0 border-t border-white/10 px-4 py-3">
        <p className="text-center text-[10px] font-bold tracking-wide text-white/40">{t('nav.footer')}</p>
      </div>
    </aside>
  );
}
