// Netlify serverless function: server-side proxy for Yahoo Finance chart data.
// Called by stock-ticker.html as /.netlify/functions/finance?symbol=AAPL&range=1y
// Running on the server avoids all browser CORS restrictions and Yahoo Finance IP blocks.
// Supports global markets including Indian NSE/BSE stocks (e.g. RELIANCE.NS, TCS.NS).

const https = require('https');
const zlib  = require('zlib');

// Reuse HTTPS connections across warm Lambda invocations for lower latency.
const agent = new https.Agent({ keepAlive: true, maxSockets: 4 });

exports.handler = async function (event) {
  const params = event.queryStringParameters || {};
  // Preserve case for suffixes like .NS, .BO, .L, .T — only uppercase the base part.
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
      agent,
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':          'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection':      'keep-alive',
        'Origin':          'https://finance.yahoo.com',
        'Referer':         'https://finance.yahoo.com/',
      },
    };

    const req = https.get(yUrl, options, (res) => {
      const encoding = (res.headers['content-encoding'] || '').toLowerCase();
      let stream = res;
      if (encoding === 'gzip')    stream = res.pipe(zlib.createGunzip());
      else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress());
      else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());

      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: {
            'Content-Type':                'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
      stream.on('error', (err) => {
        resolve({
          statusCode: 502,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: err.message }),
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
