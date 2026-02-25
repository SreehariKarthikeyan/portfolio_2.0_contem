// Netlify serverless function: server-side proxy for Yahoo Finance chart data.
// Called by stock-ticker.html as /.netlify/functions/finance?symbol=AAPL&range=1y
// Running on the server avoids all browser CORS restrictions and Yahoo Finance IP blocks.

const https = require('https');

exports.handler = async function (event) {
  const params = event.queryStringParameters || {};
  const symbol = (params.symbol || '').trim().toUpperCase();
  const range  = params.range  || '1y';

  if (!symbol) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'symbol parameter is required' }),
    };
  }

  const yUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
             + `?interval=1d&range=${encodeURIComponent(range)}`;

  return new Promise((resolve) => {
    const options = {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':          'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin':          'https://finance.yahoo.com',
        'Referer':         'https://finance.yahoo.com/',
      },
    };

    const req = https.get(yUrl, options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: {
            'Content-Type':                'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body,
        });
      });
    });

    req.setTimeout(10000, () => {
      req.destroy();
      resolve({
        statusCode: 504,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Yahoo Finance request timed out' }),
      });
    });

    req.on('error', (err) => {
      resolve({
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: err.message }),
      });
    });
  });
};
