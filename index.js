const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Allow requests from your Google Apps Script frontend
app.use(cors());

app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Missing "url" query parameter.');
  }

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      responseType: 'text'
    });

    // Inject a <base> tag so relative CSS, images, and links resolve properly
    const baseTag = `<base href="${targetUrl}">`;
    const modifiedHtml = response.data.replace(/<head>/i, `<head>${baseTag}`);

    res.set('Content-Type', 'text/html');
    res.send(modifiedHtml);
  } catch (error) {
    res.status(500).send(`Proxy error: ${error.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
