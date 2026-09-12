export function buildTrainerProviderTabs(t: (key: string) => string) {
  return [
    { value: 'external' as const, label: t('fitness.trainers.externalProviders') },
    { value: 'gym' as const, label: t('fitness.trainers.gymProviders') },
  ];
}

export const TRAINER_TABS_LAYOUT = {
  containerClass: 'grid w-full grid-cols-2 gap-1',
  buttonClass: 'w-full',
} as const;
