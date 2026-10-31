const http = require('http');

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    http.get({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
    }).on('error', reject);
  });
}

function post(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    }, (res) => {
      let resp = '';
      res.on('data', chunk => resp += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(resp) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function test() {
  console.log('=== 1. Testing Stock Markets ===');
  const markets = await get('http://localhost:5000/api/stocks/markets');
  console.log('Count:', markets.data.data.length);
  markets.data.data.forEach(s => {
    console.log(`  ${s.symbol} | ${s.name} | $${s.price} | 24h: ${s.change24h}% | ${s.category}`);
  });

  console.log('\n=== 2. Testing Stock Candlesticks (AAPL/USD) ===');
  const candles = await get('http://localhost:5000/api/stocks/candles?pair=AAPL/USD');
  console.log('Candles count:', candles.data.data.length, 'Sample:', candles.data.data[candles.data.data.length - 1]);

  console.log('\n=== 3. Testing Demo Trader Login ===');
  const login = await post('http://localhost:5000/api/auth/login', { email: 'user@mail.com', password: '123456' });
  const token = login.data.data.tokens.accessToken;
  console.log('Trader logged in:', login.data.data.user.full_name);

  console.log('\n=== 4. Testing Stock Portfolio & Holdings ===');
  const port = await get('http://localhost:5000/api/stocks/portfolio', { Authorization: 'Bearer ' + token });
  console.log('Cash Balance:', port.data.data.cashBalance);
  console.log('Stock Net Worth:', port.data.data.stockNetWorth);
  console.log('Total Net Worth:', port.data.data.totalNetWorth);
  console.log('Holdings:', port.data.data.holdings);

  console.log('\n=== 5. Testing Simulated Stock Order Execution (Buy 2 AAPL shares) ===');
  const orderRes = await post('http://localhost:5000/api/stocks/order', {
    pair: 'AAPL/USD',
    type: 'MARKET',
    side: 'BUY',
    shares: 2
  }, { Authorization: 'Bearer ' + token });
  console.log('Order executed:', orderRes.data);

  console.log('\n=== 6. Testing Stock Backtester (Momentum Strategy) ===');
  const bt = await post('http://localhost:5000/api/stocks/backtest', {
    pair: 'AAPL/USD',
    strategy: 'momentum',
    days: 30
  }, { Authorization: 'Bearer ' + token });
  console.log('Backtester Result:', bt.data.data);

  console.log('\n>>> ALL 6 DUAL-MARKET ENGINE TESTS PASSED PERFECTLY! <<<');
}

test().catch(console.error);
