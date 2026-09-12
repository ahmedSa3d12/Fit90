import { Bell, CalendarDays, LogOut, Menu, User } from 'lucide-react';
import { format } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PreferenceToggles } from '@/components/layout/preference-toggles';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNotificationCount, useNotifications } from '@/hooks/use-notifications';
import { useMenu } from '@/hooks/use-menu';
import { findOwningDepartment } from '@/lib/menu-nav';
import { api } from '@/lib/api';
import { formatDigits, initials } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';
import { userAvatarUrl } from '@/components/employees/use-uploads';

function getGreetingKey(hour: number) {
  if (hour < 12) return 'greeting.morning';
  if (hour < 17) return 'greeting.afternoon';
  return 'greeting.night';
}

function DateTimePill() {
  const { locale, t } = useLocale();
  const dateFnsLocale = locale === 'ar' ? ar : enUS;
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  let h = now.getHours();
  const period = h >= 12 ? t('common.evening') : t('common.morning');
  h = h % 12 || 12;
  const m = now.getMinutes().toString().padStart(2, '0');
  const s = now.getSeconds().toString().padStart(2, '0');
  const dateLabel = formatDigits(format(now, locale === 'ar' ? 'EEEE d MMM' : 'EEE, MMM d', { locale: dateFnsLocale }), locale);

  return (
    <div className="hidden items-stretch overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-br from-primary/5 to-background shadow-sm sm:flex">
      <div className="flex items-center gap-2 border-e border-primary/10 px-3 py-2 text-xs text-muted-foreground">
        <CalendarDays className="size-3.5 shrink-0 text-primary" />
        <span className="max-w-[9rem] truncate font-medium">{dateLabel}</span>
      </div>
      <div className="flex items-center gap-2 bg-primary/[0.03] px-3 py-2 text-sm">
        <span className="nums tabular-nums font-bold text-primary">{formatDigits(`${h}:${m}:${s}`, locale)}</span>
        <span className="text-xs text-muted-foreground">{period}</span>
      </div>
    </div>
  );
}

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, logout } = useAuth();
  const avatarSrc = userAvatarUrl(user?.image);
  const { locale, t } = useLocale();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { data: menu } = useMenu();
  const { data: count = 0 } = useNotificationCount();
  const { data: notifications } = useNotifications();
  const unreadPreview = notifications?.filter((n) => !n.read).slice(0, 5) ?? [];

  const greeting = useMemo(() => t(getGreetingKey(new Date().getHours())), [t]);
  const activeUnit = useMemo(
    () => (menu ? findOwningDepartment(menu, location.pathname, location.search) : null),
    [menu, location.pathname, location.search],
  );
  const levelLabel = user?.level != null ? t(`levels.${user.level}`) : '';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const openNotification = async (id: number, url: string | null) => {
    await api.patch(`/notifications/${id}/read`);
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    if (url) navigate(url);
  };

  return (
    <header className="sticky top-0 z-30 overflow-hidden border-b border-border/60 bg-card/90 shadow-sm backdrop-blur-xl dark:border-white/[0.06] dark:bg-[hsl(222_17%_10%_/0.88)]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-l from-primary/[0.04] via-transparent to-brand-400/[0.03] dark:from-primary/[0.05] dark:to-transparent" />
      <div className="pointer-events-none absolute -start-20 top-0 size-40 rounded-full bg-primary/5 blur-3xl" />
      <div className="h-1 bg-brand-gradient" aria-hidden />

      <div className="relative flex h-[4.75rem] items-center gap-3 px-4 md:px-6 lg:justify-between">
        <Button variant="ghost" size="icon" className="shrink-0 lg:hidden" onClick={onMenuClick} aria-label={t('common.menu')}>
          <Menu />
        </Button>

        <div className="hidden min-w-0 items-center gap-7 lg:flex">
          <div className="min-w-0 max-w-[220px]">
            <p className="truncate text-sm font-bold leading-tight text-foreground dark:text-white">
              {greeting},{' '}
              <span className="text-primary">{user?.name ?? t('common.user')}</span>
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-[11px] font-semibold tracking-wide text-primary/70">FIT90</span>
              {activeUnit && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="truncate text-[11px] text-muted-foreground dark:text-white/75">{activeUnit.title}</span>
                </>
              )}
            </div>
          </div>
          <DateTimePill />
        </div>

        <div className="flex flex-1 items-center justify-end gap-1.5 md:gap-2 lg:ml-10 lg:flex-none">
          <div className="lg:hidden">
            <DateTimePill />
          </div>

          <PreferenceToggles className="lg:ml-2.5" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative rounded-xl border border-transparent bg-muted/40 hover:border-primary/15 hover:bg-primary/5"
                aria-label={t('common.notifications')}
              >
                <Bell className="size-[18px] text-primary/80" />
                {count > 0 && (
                  <span className="absolute -end-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white ring-2 ring-card">
                    {formatDigits(count > 9 ? '9+' : count, locale)}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>{t('common.notifications')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {unreadPreview.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t('common.noNotifications')}</div>
              ) : (
                unreadPreview.map((n) => (
                  <DropdownMenuItem
                    key={n.id}
                    className="flex cursor-pointer flex-col items-start gap-0.5"
                    onSelect={() => void openNotification(n.id, n.url)}
                  >
                    <span className="font-medium">{n.title}</span>
                    {n.body && <span className="text-xs text-muted-foreground line-clamp-2">{n.body}</span>}
                    {(n.date || n.time) && (
                      <span className="nums text-[10px] text-muted-foreground">
                        {n.date ? formatDigits(n.date, locale) : ''}
                        {n.time ? ` ${formatDigits(n.time, locale)}` : ''}
                      </span>
                    )}
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/notifications" className="w-full justify-center text-primary">
                  {t('common.viewAllNotifications')}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="mx-0.5 hidden h-9 w-px bg-gradient-to-b from-transparent via-border to-transparent sm:block" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 rounded-xl border border-primary/10 bg-gradient-to-br from-primary/5 to-transparent p-1 ps-2.5 transition-all hover:border-primary/25 hover:shadow-sm">
                <div className="hidden text-end leading-tight sm:block">
                  <div className="max-w-[140px] truncate text-sm font-semibold">{user?.name ?? t('common.user')}</div>
                  <div className="text-[11px] text-muted-foreground">{levelLabel}</div>
                </div>
                <Avatar className="size-9 ring-2 ring-primary/20">
                  {avatarSrc && <AvatarImage src={avatarSrc} alt="" />}
                  <AvatarFallback className="bg-brand-gradient text-xs font-bold text-white">
                    {initials(user?.name, locale)}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{user?.name ?? t('common.user')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/profile')}>
                <User /> {t('common.profile')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut /> {t('common.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
