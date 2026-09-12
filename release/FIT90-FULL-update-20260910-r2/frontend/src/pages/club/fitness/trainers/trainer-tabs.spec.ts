import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTrainerProviderTabs, TRAINER_TABS_LAYOUT } from './trainer-tabs.ts';

test('builds trainer-tab labels from the active locale', () => {
  const english = buildTrainerProviderTabs((key) => ({
    'fitness.trainers.externalProviders': 'External instructors',
    'fitness.trainers.gymProviders': 'Gym instructors',
  })[key] ?? key);
  const arabic = buildTrainerProviderTabs((key) => ({
    'fitness.trainers.externalProviders': 'مدربون خارجيون',
    'fitness.trainers.gymProviders': 'مدربو الجيم',
  })[key] ?? key);

  assert.deepEqual(english, [
    { value: 'external', label: 'External instructors' },
    { value: 'gym', label: 'Gym instructors' },
  ]);
  assert.deepEqual(arabic, [
    { value: 'external', label: 'مدربون خارجيون' },
    { value: 'gym', label: 'مدربو الجيم' },
  ]);
});

test('puts external trainers first and gives both trainer tabs equal full-row width', () => {
  assert.deepEqual(buildTrainerProviderTabs((key) => key).map((tab) => tab.value), ['external', 'gym']);
  assert.match(TRAINER_TABS_LAYOUT.containerClass, /w-full/);
  assert.match(TRAINER_TABS_LAYOUT.containerClass, /grid-cols-2/);
  assert.match(TRAINER_TABS_LAYOUT.buttonClass, /w-full/);
});
