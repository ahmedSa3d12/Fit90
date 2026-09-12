import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createServer } from 'vite';

test('monthly nutrition schedule launcher does not show a nutrition appointment booking button', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { NutritionMonthlyScheduleLauncher } = await vite.ssrLoadModule(
      '/src/pages/scheduling/nutrition-monthly-schedule-launcher.tsx',
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const html = renderToString(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(NutritionMonthlyScheduleLauncher),
      ),
    );

    assert.doesNotMatch(html, /حجز موعد تغذية/);
  } finally {
    await vite.close();
  }
});
