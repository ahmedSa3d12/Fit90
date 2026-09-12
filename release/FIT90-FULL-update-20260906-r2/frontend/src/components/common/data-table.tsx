import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Copy, Download, Printer, Search } from 'lucide-react';
import { type ReactNode, useRef } from 'react';
import * as xlsx from 'xlsx';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState } from '@/components/common/states';
import { toast } from 'sonner';
import { useLocale } from '@/store/locale';

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  searchClassName?: string;
  toolbar?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  enableExport?: boolean;
}

export function DataTable<T>({
  columns,
  data,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  search,
  onSearchChange,
  searchPlaceholder,
  searchClassName,
  toolbar,
  emptyTitle,
  emptyDescription,
  emptyAction,
  enableExport = true,
}: DataTableProps<T>) {
  const { t, ui } = useLocale();
  const resolvedSearchPlaceholder = searchPlaceholder ?? ui('بحث في الجدول…');
  const resolvedEmptyTitle = emptyTitle ?? t('shared.noData');
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: Math.ceil(total / pageSize),
  });

  const tableRef = useRef<HTMLDivElement>(null);

  const handleCopy = () => {
    const headers = columns.map((c) => (typeof c.header === 'string' ? c.header : c.id ?? '')).join('\t');
    const rows = data.map((row) =>
      columns
        .map((col) => {
          const key = (col as { accessorKey?: string }).accessorKey;
          if (!key) return '';
          return String((row as Record<string, unknown>)[key] ?? '');
        })
        .join('\t'),
    );
    void navigator.clipboard.writeText([headers, ...rows].join('\n'));
    toast.success(ui('تم النسخ'));
  };

  const handleExcel = () => {
    const headers = columns.map((c) => (typeof c.header === 'string' ? c.header : c.id ?? ''));
    const rows = data.map((row) =>
      columns.map((col) => {
        const key = (col as { accessorKey?: string }).accessorKey;
        if (!key) return '';
        return String((row as Record<string, unknown>)[key] ?? '');
      })
    );
    const ws = xlsx.utils.aoa_to_sheet([headers, ...rows]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Data');
    xlsx.writeFile(wb, 'export.xlsx');
    toast.success(ui('تم تصدير Excel بنجاح'));
  };

  const handlePrint = () => {
    const style = document.createElement('style');
    style.innerHTML = `
      @media print {
        body * { visibility: hidden !important; }
        .data-table-print-area, .data-table-print-area * { visibility: visible !important; }
        .data-table-print-area { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; margin: 0 !important; padding: 0 !important; }
      }
    `;
    document.head.appendChild(style);
    
    if (tableRef.current) {
      tableRef.current.classList.add('data-table-print-area');
    }

    const onAfterPrint = () => {
      document.head.removeChild(style);
      if (tableRef.current) {
        tableRef.current.classList.remove('data-table-print-area');
      }
      window.removeEventListener('afterprint', onAfterPrint);
    };
    window.addEventListener('afterprint', onAfterPrint);
    
    setTimeout(() => {
      window.print();
    }, 50);
  };

  if (isError) {
    return <ErrorState message={errorMessage} onRetry={onRetry} />;
  }

  const hasToolbar = !!(onSearchChange || toolbar || (enableExport && data.length > 0));

  return (
    <div className="space-y-3">
      <div ref={tableRef} className="surface-panel overflow-hidden rounded-xl border bg-card shadow-sm">
        {hasToolbar && (
          <div className="table-panel-header flex flex-col gap-3 border-b border-primary/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-2">
              {onSearchChange && (
                <div className={`relative max-w-sm flex-1 ${searchClassName ?? ''}`}>
                  <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pe-9 h-9 text-sm"
                    placeholder={resolvedSearchPlaceholder}
                    value={search ?? ''}
                    onChange={(e) => onSearchChange(e.target.value)}
                  />
                </div>
              )}
              {toolbar}
            </div>
            {enableExport && data.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Download className="size-4" />
                    {ui('تصدير')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleCopy}>
                    <Copy className="size-4" /> {ui('نسخ')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handlePrint}>
                    <Printer className="size-4" /> {ui('طباعة')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExcel}>
                    <Download className="size-4" /> Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
        <Table>
          <TableHeader className="table-panel-header sticky top-0 z-10 border-b border-primary/10 backdrop-blur-sm">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!isLoading && data.length === 0 && (
              <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-4 sm:p-6">
                  <EmptyState
                    compact
                    title={resolvedEmptyTitle}
                    description={emptyDescription}
                    action={emptyAction}
                    className="empty-state-inset"
                  />
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {!isLoading && total > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </div>
  );
}
