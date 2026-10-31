const http = require('http');

function post(url, body, token) {
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
        ...(token ? { Authorization: 'Bearer ' + token } : {})
      }
    }, (res) => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(d) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    http.get({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: token ? { Authorization: 'Bearer ' + token } : {}
    }, (res) => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(d) }));
    }).on('error', reject);
  });
}

async function runTest() {
  console.log('=== STEP 1: Log in as Admin ===');
  const adminLogin = await post('http://localhost:5000/api/auth/login', { email: 'admin@mail.com', password: '123456' });
  const adminToken = adminLogin.data.data.tokens.accessToken;
  console.log('Admin Authenticated:', adminLogin.data.data.user.full_name);

  console.log('\n=== STEP 2: Log in as Demo Trader ===');
  const userLogin = await post('http://localhost:5000/api/auth/login', { email: 'user@mail.com', password: '123456' });
  const userToken = userLogin.data.data.tokens.accessToken;
  const userId = userLogin.data.data.user.id;
  console.log('Trader Authenticated:', userLogin.data.data.user.full_name, 'ID:', userId);

  console.log('\n=== STEP 3: Admin executes Managed Trade for User ===');
  const tradeRes = await post('http://localhost:5000/api/admin/trade-for-user', {
    user_id: userId,
    pair: 'BTC/USDT',
    side: 'BUY',
    amount: 0.20,
    initial_profit: 300.00,
    target_outcome: 'IN_PROGRESS',
    admin_notes: 'VIP Supervisor Long Position'
  }, adminToken);
  console.log('Managed Trade Created:', tradeRes.data.success, 'Trade ID:', tradeRes.data.data.id, 'Initial Profit: $' + tradeRes.data.data.current_profit);
  const tradeId = tradeRes.data.data.id;

  console.log('\n=== STEP 4: Admin manipulates profit (+ $150.00) in real time ===');
  const adjust1 = await post('http://localhost:5000/api/admin/alter-profit', {
    trade_id: tradeId,
    delta_profit: 150.00
  }, adminToken);
  console.log('Profit Adjusted:', adjust1.data.success, 'New Profit: $' + adjust1.data.data.current_profit);

  console.log('\n=== STEP 5: Admin manipulates profit (+ $250.00) ===');
  const adjust2 = await post('http://localhost:5000/api/admin/alter-profit', {
    trade_id: tradeId,
    delta_profit: 250.00
  }, adminToken);
  console.log('Profit Adjusted:', adjust2.data.success, 'New Profit: $' + adjust2.data.data.current_profit);

  console.log('\n=== STEP 6: Trader checks active managed trades on their screen ===');
  const userTrades = await get('http://localhost:5000/api/trade/managed', userToken);
  console.log('Trader fetched managed trades count:', userTrades.data.data.length);
  const userTrade = userTrades.data.data.find(t => t.id === tradeId);
  console.log('Trader sees trade on screen:', {
    pair: userTrade.pair,
    side: userTrade.side,
    current_profit: '$' + userTrade.current_profit,
    target_outcome: userTrade.target_outcome
  });

  console.log('\n=== STEP 7: Admin locks in WIN and settles profit to user cash balance ===');
  const closeRes = await post('http://localhost:5000/api/admin/close-trade', {
    trade_id: tradeId,
    outcome: 'WIN'
  }, adminToken);
  console.log('Trade settled:', closeRes.data.success, 'Realized Profit: $' + closeRes.data.data.realized_pnl);

  console.log('\n=== STEP 8: Check Trader universal USD cash balance ===');
  const port = await get('http://localhost:5000/api/wallet/portfolio', userToken);
  const usdWallet = port.data.data.wallets.find(w => w.asset_symbol === 'USD');
  console.log('Trader USD Cash Balance:', '$' + usdWallet.balance);

  console.log('\n>>> COMPLETE END-TO-END MANAGED TRADING FLOW VERIFIED SUCCESSFULLY! <<<');
  process.exit(0);
}

runTest().catch(e => {
  console.error('Test Failed:', e);
  process.exit(1);
});
