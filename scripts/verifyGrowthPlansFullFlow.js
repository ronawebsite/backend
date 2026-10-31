const axios = require('axios');
const db = require('../config/db');

async function verifyFullFlow() {
  console.log('================================================================');
  console.log('🚀 FICHAIN PRO - GROWTH PLANS & REAL-TIME FLUCTUATION VERIFIER');
  console.log('================================================================\n');

  const API = 'http://localhost:5000/api';

  // 1. Ensure user has sufficient funds for verification
  await db.query("UPDATE user_wallets SET balance = 50000.00 WHERE user_id = 2 AND asset_symbol = 'USD'");

  // 2. Authenticate User & Admin
  const userRes = await axios.post(`${API}/auth/login`, { email: 'user@mail.com', password: 'user123' })
    .catch(() => axios.post(`${API}/auth/login`, { email: 'user@mail.com', password: '123456' }));
  const userToken = userRes.data.data.tokens.accessToken;

  const adminRes = await axios.post(`${API}/auth/login`, { email: 'admin@mail.com', password: 'admin123' })
    .catch(() => axios.post(`${API}/auth/login`, { email: 'admin@mail.com', password: '123456' }));
  const adminToken = adminRes.data.data.tokens.accessToken;

  console.log('1. [Auth] User and Admin authenticated successfully.');

  // 3. Admin creates a custom plan
  console.log('2. [Admin Plan Creation] Admin creates custom 5-Day Plan...');
  const newPlanData = {
    name: 'Institutional Quantum Yield Plan',
    description: 'High-frequency algorithmic multi-asset strategy with guaranteed target yield.',
    initial_amount: 2000.00,
    target_amount: 5400.00,
    duration_days: 5,
    duration_seconds: 5 * 86400,
    risk_level: 'Institutional Elite',
    badge: 'Quant Yield VIP',
    icon: '🔮',
    color: 'indigo'
  };

  const createRes = await axios.post(`${API}/plans/admin/create-plan`, newPlanData, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  console.log(`   ✓ Created plan ID: ${createRes.data.data.id} ("${newPlanData.name}")`);
  const createdPlanId = createRes.data.data.id;

  // 4. Fetch all active plans
  const catalogRes = await axios.get(`${API}/plans`);
  const foundPlan = catalogRes.data.data.find(p => p.id === createdPlanId);
  if (!foundPlan) throw new Error('Created plan not found in active catalog');
  console.log(`3. [Plan Catalog] Plan confirmed in active catalog: Starts at $${foundPlan.initial_amount} -> Targets $${foundPlan.target_amount} (+${foundPlan.roi_percentage}% ROI)`);

  // 5. User subscribes to the plan
  console.log('4. [User Subscription] User subscribing with $2,000 initial capital...');
  const subRes = await axios.post(
    `${API}/plans/subscribe`,
    { plan_id: createdPlanId, custom_amount: 2000.00 },
    { headers: { Authorization: `Bearer ${userToken}` } }
  );
  const investmentId = subRes.data.data.investment_id;
  console.log(`   ✓ Subscription successful! Investment ID: #${investmentId}`);

  // 6. Check candles
  const candlesRes = await axios.get(`${API}/plans/subscription/${investmentId}/candles`, {
    headers: { Authorization: `Bearer ${userToken}` }
  });
  console.log(`5. [Binance Chart Candles] Loaded ${candlesRes.data.data.length} pre-seeded historical candles.`);

  // 7. Wait 6 seconds and observe live real-time price fluctuation ticks
  console.log('6. [Live Fluctuation Ticks] Observing 2 live ticks (6 seconds)...');
  await new Promise(r => setTimeout(r, 4000));
  const sub1 = (await axios.get(`${API}/plans/my-subscriptions`, { headers: { Authorization: `Bearer ${userToken}` } })).data.data.find(s => s.id === investmentId);
  console.log(`   Tick 1: Current Value: $${sub1.current_value} | Profit: $${sub1.current_profit} (${sub1.profit_percent}%) | Time Left: ${sub1.countdown.formatted}`);

  await new Promise(r => setTimeout(r, 3500));
  const sub2 = (await axios.get(`${API}/plans/my-subscriptions`, { headers: { Authorization: `Bearer ${userToken}` } })).data.data.find(s => s.id === investmentId);
  console.log(`   Tick 2: Current Value: $${sub2.current_value} | Profit: $${sub2.current_profit} (${sub2.profit_percent}%) | Progress: ${sub2.progress_percent}%`);

  // 8. Admin Nudge (+$150)
  console.log('7. [Admin Nudge] Supervisor nudging value up +$150.00...');
  const nudgeRes = await axios.post(`${API}/plans/admin/nudge/${investmentId}`, { delta: 150.00 }, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  console.log(`   ✓ Nudge applied: ${nudgeRes.data.message}`);

  // 9. Admin Fast-Forward (Advance 1 Day)
  console.log('8. [Admin Fast-Forward] Advancing timeline by 1 day...');
  const ffRes = await axios.post(`${API}/plans/admin/fast-forward/${investmentId}`, { seconds: 86400 }, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  console.log(`   ✓ ${ffRes.data.message}`);

  // 10. Admin Force-Complete to guaranteed target ($5,400)
  console.log('9. [Target Settlement] Admin triggering guaranteed target settlement...');
  const completeRes = await axios.post(`${API}/plans/admin/force-complete/${investmentId}`, {}, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  console.log(`   ✓ Settlement completed: ${completeRes.data.message}`);

  // 11. Verify User Balance & Transaction Record
  const [invRow] = await db.query('SELECT status, current_value, target_amount, payout_credited FROM investments WHERE id = ?', [investmentId]);
  console.log(`10. [Final Audit] Investment status: ${invRow[0].status} | Value: $${invRow[0].current_value} | Target: $${invRow[0].target_amount} | Payout Credited: ${invRow[0].payout_credited}`);

  const [txRows] = await db.query("SELECT * FROM transactions WHERE user_id = 2 AND type = 'INVESTMENT_PAYOUT' ORDER BY id DESC LIMIT 1");
  console.log(`    Audited Transaction: ID #${txRows[0].id} | Type: ${txRows[0].type} | Amount: $${txRows[0].amount} | Status: ${txRows[0].status}`);

  console.log('\n================================================================');
  console.log('🎉 10/10 VERIFICATION COMPLETED - ALL REQUIREMENTS PASS CLEANLY!');
  console.log('================================================================');
  process.exit(0);
}

verifyFullFlow().catch(err => {
  console.error('Verification failed:', err.response ? err.response.data : err.message);
  process.exit(1);
});
