export function leadDetailValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed || '—';
}
