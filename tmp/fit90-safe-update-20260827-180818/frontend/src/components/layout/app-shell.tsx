import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { RouteGuard } from '@/components/auth/route-guard';
import { Button } from '@/components/ui/button';
import { recordNavVisit } from '@/lib/nav-visit-tracker';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useLocale();
  const { pathname } = useLocation();

  useEffect(() => {
    recordNavVisit(pathname);
  }, [pathname]);

  return (
    <div className="app-shell-bg flex h-screen overflow-hidden">
      <div className="hidden lg:block">
        <Sidebar onNavigate={() => setMobileOpen(false)} />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className={cn('absolute inset-y-0 end-0 animate-slide-up shadow-2xl')}>
            <div className="relative h-full">
              <Button
                variant="ghost"
                size="icon"
                className="absolute -start-12 top-3 text-white hover:bg-white/10"
                onClick={() => setMobileOpen(false)}
                aria-label={t('common.close')}
              >
                <X />
              </Button>
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main className="app-main-scroll flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1440px] p-4 md:p-6 lg:p-8 animate-fade-in">
            <RouteGuard>
              <Outlet />
            </RouteGuard>
          </div>
        </main>
      </div>
    </div>
  );
}
