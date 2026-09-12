import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

test('member entry page presents today check-in and checkout columns', async () => {
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
    const { ClubMemberEntryPage } = await vite.ssrLoadModule('/src/pages/club/member-entry.tsx');
    const { LocaleProvider } = await vite.ssrLoadModule('/src/store/locale.tsx');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const html = renderToString(
      React.createElement(
        LocaleProvider,
        null,
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(MemoryRouter, null, React.createElement(ClubMemberEntryPage)),
        ),
      ),
    );

    for (const header of ['الاسم', 'كود العضو', 'التاريخ', 'وقت الدخول', 'وقت الخروج', 'المدة (دقيقة)', 'إجراءات']) {
      assert.ok(html.includes(`>${header}<`), `missing table header: ${header}`);
    }
    assert.match(html, /تسجيل دخول بالباركود/);
  } finally {
    await vite.close();
  }
});
