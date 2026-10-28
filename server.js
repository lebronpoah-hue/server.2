'use strict';

const express = require('express');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MAX_QUERY_LENGTH = 200;

const SEARCH_ENGINES = Object.freeze({
  duckduckgo: {
    buildUrl: (query) =>
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
  },
  google: {
    buildUrl: (query) =>
      `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  },
  bing: {
    buildUrl: (query) =>
      `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
  },
});

app.disable('x-powered-by');

app.get('/health', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, service: 'study-search-redirect' });
});

app.get('/api/search', (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const engine = typeof req.query.engine === 'string'
    ? req.query.engine.toLowerCase()
    : 'duckduckgo';

  if (!query) {
    return res.status(400).json({ error: 'A search query is required.' });
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return res.status(413).json({
      error: `Search queries must be ${MAX_QUERY_LENGTH} characters or fewer.`,
    });
  }

  const selectedEngine = SEARCH_ENGINES[engine];
  if (!selectedEngine) {
    return res.status(400).json({ error: 'Unsupported search engine.' });
  }

  res.set({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  });

  return res.redirect(303, selectedEngine.buildUrl(query));
});

app.get('/', (_req, res) => {
  res.status(200).type('text/plain').send('Study search redirect is running.');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Study search redirect listening on port ${PORT}`);
});
