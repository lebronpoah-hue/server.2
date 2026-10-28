const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();

app.get('/api/search', async (req, res) => {
  const engine = (req.query.engine || 'duckduckgo').toLowerCase();
  const q = String(req.query.q || '').trim();

  if (!q) {
    return res.status(400).send('Missing q');
  }

  let target = '';
  if (engine === 'duckduckgo') {
    target = 'https://duckduckgo.com/?q=' + encodeURIComponent(q);
  } else if (engine === 'google') {
    target = 'https://www.google.com/search?q=' + encodeURIComponent(q);
  } else if (engine === 'bing') {
    target = 'https://www.bing.com/search?q=' + encodeURIComponent(q);
  } else {
    return res.status(400).send('Unsupported engine');
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
      }
    });

    const html = await upstream.text();

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error(error);
    res.status(500).send('Search fetch failed');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
