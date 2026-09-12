import { CalendarDays, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { mosMenuLabel } from '@/lib/mos-menu-utils';
import { useLocale } from '@/store/locale';

export function MosSalesSchedulePage() {
  const { t } = useLocale();
  const title = mosMenuLabel(t, 'salesSchedule');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={title} eyebrow={mosMenuLabel(t, 'management')} />
      <Card className="overflow-hidden border-primary/20 shadow-md">
        <div className="h-1 bg-gradient-to-l from-primary/70 via-primary to-violet-500/60" />
        <CardContent className="flex flex-col items-center gap-6 py-14 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <CalendarDays className="size-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Sales follow-ups and subscription scheduling are managed from memberships and the club calendar.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="brand" asChild>
              <Link to="/club/subscriptions"><ExternalLink className="size-4" /> {t('nav.mos.memberships')}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/club/fitness/scheduling"><ExternalLink className="size-4" /> {t('nav.mos.classesSched')}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function MosAboutPage() {
  const { t } = useLocale();
  const title = mosMenuLabel(t, 'about');

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title={title} />
      <Card className="overflow-hidden border-dashed shadow-sm">
        <div className="h-1 bg-gradient-to-l from-emerald-500/50 via-primary to-primary/40" />
        <CardContent className="space-y-4 py-10 text-center">
          <p className="text-2xl font-bold tracking-tight">FIT90 Club</p>
          <p className="text-sm text-muted-foreground">
            Modern gym management aligned with MOS Club workflows — members, memberships, benefits, reports, and staff in one place.
          </p>
          <p className="text-xs text-muted-foreground">Version 1.0 · {new Date().getFullYear()}</p>
        </CardContent>
      </Card>
    </div>
  );
}
