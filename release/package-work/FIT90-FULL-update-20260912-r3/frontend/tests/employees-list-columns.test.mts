import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

test('employees table does not render a department column', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    globalThis.localStorage = {
      getItem: () => 'ar',
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    };
    const { EmployeesListPage } = await vite.ssrLoadModule('/src/pages/employees/list.tsx');
    const { LocaleProvider } = await vite.ssrLoadModule('/src/store/locale.tsx');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const html = renderToString(
      React.createElement(
        LocaleProvider,
        null,
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(MemoryRouter, null, React.createElement(EmployeesListPage)),
        ),
      ),
    );

    assert.doesNotMatch(html, /<th[^>]*>الادارة<\/th>/);
  } finally {
    await vite.close();
  }
});
