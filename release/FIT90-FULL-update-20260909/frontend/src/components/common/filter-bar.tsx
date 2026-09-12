import { useSearchParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';

export interface FilterField {
  key: string;
  label: string;
  type: 'text' | 'select';
  options?: { value: string; label: string }[];
  placeholder?: string;
}

interface FilterBarProps {
  fields?: FilterField[];
  searchPlaceholder?: string;
  className?: string;
  extra?: ReactNode;
  /** Query keys kept when clearing filters (e.g. isSpecial on the special subs page). */
  preserveParams?: string[];
}

export function FilterBar({ fields = [], searchPlaceholder, className, extra, preserveParams = [] }: FilterBarProps) {
  const { t, ui } = useLocale();
  const resolvedSearchPlaceholder = searchPlaceholder ?? ui('بحث…');
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set('page', '1');
    setSearchParams(next, { replace: true });
  };

  const setSearch = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('search', value);
    else next.delete('search');
    next.set('page', '1');
    setSearchParams(next, { replace: true });
  };

  const clearAll = () => {
    const next = new URLSearchParams();
    for (const key of preserveParams) {
      const value = searchParams.get(key);
      if (value) next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  const hasFilters =
    search ||
    fields.some((f) => searchParams.get(f.key)) ||
    [...searchParams.keys()].some((k) => !preserveParams.includes(k) && !['page', 'pageSize', 'search', 'sort', 'order', 'tab'].includes(k));

  return (
    <div className={cn('surface-panel mb-3 flex flex-col gap-3 rounded-xl border bg-card px-4 py-3', className)}>
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
        <div className="min-w-[200px] flex-1">
          <Label htmlFor="filter-search" className="sr-only">
            {t('shared.search')}
          </Label>
          <Input
            id="filter-search"
            placeholder={resolvedSearchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {fields.map((field) => (
          <div key={field.key} className="min-w-[160px]">
            <Label className="mb-1.5 block text-xs text-muted-foreground">{field.label}</Label>
            {field.type === 'select' ? (
              <Select value={searchParams.get(field.key) ?? ''} onValueChange={(v) => setFilter(field.key, v === 'all' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={field.placeholder ?? field.label} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('shared.all')}</SelectItem>
                  {field.options?.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder={field.placeholder}
                value={searchParams.get(field.key) ?? ''}
                onChange={(e) => setFilter(field.key, e.target.value)}
              />
            )}
          </div>
        ))}
        {extra}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            {ui('مسح الفلاتر')}
          </Button>
        )}
      </div>
    </div>
  );
}
