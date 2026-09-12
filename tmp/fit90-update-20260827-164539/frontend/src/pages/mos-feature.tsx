import { Construction, Home } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { mosMenuLabel } from '@/lib/mos-menu-utils';
import { MOS_MENU } from '@/lib/mos-menu';
import { useLocale } from '@/store/locale';

function findKeyByPath(pathname: string): string | null {
  const all = MOS_MENU;
  let found: string | null = null;
  let bestLen = -1;

  const walk = (items: typeof MOS_MENU) => {
    for (const item of items) {
      if (item.path && (pathname === item.path || pathname.startsWith(item.path + '/'))) {
        if (item.path.length > bestLen) {
          bestLen = item.path.length;
          found = item.key;
        }
      }
      if (item.children) walk(item.children);
    }
  };

  walk(all);
  return found;
}

export function MosFeaturePage() {
  const { pathname } = useLocation();
  const { t } = useLocale();
  const key = findKeyByPath(pathname);
  const title = key ? mosMenuLabel(t, key) : pathname;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title={title} description={pathname} eyebrow={t('nav.sections.club')} />
      <Card className="overflow-hidden border-dashed border-primary/20 shadow-sm">
        <div className="h-1 bg-gradient-to-l from-primary/60 via-primary to-primary/40" />
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Construction className="size-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              This screen is listed in the MOS Club menu and will be connected in a future update.
            </p>
          </div>
          <Button variant="brand" asChild>
            <Link to="/dashboard">
              <Home className="size-4" /> {t('nav.dashboard')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
