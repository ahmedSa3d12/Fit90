import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

test('nutrition booking-system route renders the appointment board instead of the monthly-plan launcher', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { SchedulingWorkspacePage } = await vite.ssrLoadModule(
      '/src/pages/scheduling/scheduling-workspace.tsx',
    );
    const { LocaleProvider } = await vite.ssrLoadModule('/src/store/locale.tsx');
    globalThis.localStorage = {
      getItem: () => 'ar',
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const html = renderToString(
      React.createElement(
        LocaleProvider,
        null,
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/scheduling/nutrition'] },
            React.createElement(SchedulingWorkspacePage, { category: 'nutrition' }),
          ),
        ),
      ),
    );

    assert.doesNotMatch(html, /إنشاء جدول جديد/);
    assert.match(html, /الحجز متاح/);
    assert.doesNotMatch(html, /حجز موعد تغذية/);
    assert.doesNotMatch(html, /لوحة حجز مواعيد التغذية/);
    assert.doesNotMatch(html, /اختر فترة حضور الأخصائي، ثم اختر الخدمة والمدة والوقت داخل الحجز/);
  } finally {
    await vite.close();
  }
});
