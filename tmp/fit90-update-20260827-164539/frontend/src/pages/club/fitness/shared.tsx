import { useQuery } from '@tanstack/react-query';
import { Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';
import { afterMenuClose } from '@/lib/confirm';

export const SELECT_CLS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

const PAGE_SIZE = 200;

/** Fetch all pages for select dropdowns (no silent 200-row cap). */
export function useFitnessResourceList<T>(
  resource: string,
  params?: Record<string, string | number | boolean | undefined>,
) {
  const query = useQuery({
    queryKey: [resource, 'full-catalog', params],
    queryFn: async () => {
      let page = 1;
      let all: T[] = [];
      let total = 0;
      do {
        const { data } = await api.get<{ data: T[]; total: number }>(`/${resource}`, {
          params: { ...params, page, pageSize: PAGE_SIZE },
        });
        all = [...all, ...data.data];
        total = data.total;
        page += 1;
      } while (all.length < total && page <= 50);
      return all;
    },
  });
  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function linesToJsonArray(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export function jsonArrayToLines(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join('\n');
  if (value == null) return '';
  return String(value);
}

interface RowActionsProps {
  inline?: boolean;
  detailsLabel?: string;
  editLabel: string;
  deleteLabel: string;
  onDetails?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function RowActions({ inline, detailsLabel, editLabel, deleteLabel, onDetails, onEdit, onDelete }: RowActionsProps) {
  if (inline) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" title={editLabel} aria-label={editLabel} onClick={onEdit}>
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="text-destructive hover:text-destructive"
          title={deleteLabel}
          aria-label={deleteLabel}
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onDetails && (
          <DropdownMenuItem onSelect={() => afterMenuClose(onDetails)}>
            <Eye className="size-4" /> {detailsLabel}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => afterMenuClose(onEdit)}>
          <Pencil className="size-4" /> {editLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onSelect={() => afterMenuClose(onDelete)}>
          <Trash2 className="size-4" /> {deleteLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
