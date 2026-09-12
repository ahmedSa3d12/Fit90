/** Job-title rule used when a scheduler must load a specific provider roster. */
export function providerJobTitleForCategory(category?: string): string | null {
  if (category === 'nutrition') return 'أخصائي تغذية';
  if (category === 'spa') return 'أخصائي سبا';
  if (category === 'personal_training') return 'مدرب';
  return null;
}
