const axios = require('axios');
const db = require('../config/db');

async function testPlansFlow() {
  console.log('Testing Growth Plans API & Real-time Flow...');

  const API_URL = 'http://localhost:5000/api';

  // Ensure user has USD balance for demo testing
  await db.query("UPDATE user_wallets SET balance = 25000.00 WHERE user_id = 2 AND asset_symbol = 'USD'");

  // 1. Login as user (user@mail.com / 123456)
  const userLogin = await axios.post(`${API_URL}/auth/login`, {
    email: 'user@mail.com',
    password: 'user123'
  }).catch(async () => {
    return await axios.post(`${API_URL}/auth/login`, {
      email: 'user@mail.com',
      password: '123456'
    });
  });

  const userToken = userLogin.data.data.tokens.accessToken;
  console.log('✅ User logged in successfully.');

  // 2. Login as admin (admin@mail.com / 123456)
  const adminLogin = await axios.post(`${API_URL}/auth/login`, {
    email: 'admin@mail.com',
    password: 'admin123'
  }).catch(async () => {
    return await axios.post(`${API_URL}/auth/login`, {
      email: 'admin@mail.com',
      password: '123456'
    });
  });
  const adminToken = adminLogin.data.data.tokens.accessToken;
  console.log('✅ Admin logged in successfully.');

  // 3. Fetch active plans (public or user)
  const plansRes = await axios.get(`${API_URL}/plans`);
  console.log(`✅ Fetched ${plansRes.data.data.length} active plans:`);
  plansRes.data.data.forEach(p => {
    console.log(`   - [ID: ${p.id}] ${p.name}: $${p.initial_amount} -> $${p.target_amount} in ${p.duration_days} days (+${p.roi_percentage}%)`);
  });

  // Pick Demo plan (5 mins) or Bitcoin 7-day plan
  const selectedPlan = plansRes.data.data.find(p => p.name.includes('Demo') || p.name.includes('Bitcoin')) || plansRes.data.data[0];

  // 4. User subscribes to selected plan
  console.log(`\nSubscribing user to plan "${selectedPlan.name}" ($${selectedPlan.initial_amount})...`);
  const subRes = await axios.post(
    `${API_URL}/plans/subscribe`,
    { plan_id: selectedPlan.id, custom_amount: selectedPlan.initial_amount },
    { headers: { Authorization: `Bearer ${userToken}` } }
  );

  console.log('✅ Subscription successful:', subRes.data.message);
  const investmentId = subRes.data.data.investment_id;

  // 5. Fetch user's active subscriptions
  const mySubsRes = await axios.get(`${API_URL}/plans/my-subscriptions`, {
    headers: { Authorization: `Bearer ${userToken}` }
  });
  console.log(`✅ User has ${mySubsRes.data.data.length} subscription(s).`);
  const activeSub = mySubsRes.data.data.find(s => s.id === investmentId);
  console.log('   Current value:', activeSub.current_value, '| Target:', activeSub.target_amount, '| Countdown:', activeSub.countdown.formatted);

  // 6. Fetch candles for charting
  const candlesRes = await axios.get(`${API_URL}/plans/subscription/${investmentId}/candles`, {
    headers: { Authorization: `Bearer ${userToken}` }
  });
  console.log(`✅ Loaded ${candlesRes.data.data.length} historical candles for Binance-style chart.`);

  // 7. Test Admin Nudge (+75.00)
  console.log('\nTesting Admin live nudge (+$75.00)...');
  const nudgeRes = await axios.post(
    `${API_URL}/plans/admin/nudge/${investmentId}`,
    { delta: 75.00 },
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  console.log('✅ Admin nudge response:', nudgeRes.data.message);

  // 8. Test Admin Fast-Forward (+60 seconds)
  console.log('\nTesting Admin fast-forward progress...');
  const ffRes = await axios.post(
    `${API_URL}/plans/admin/fast-forward/${investmentId}`,
    { seconds: 120 },
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  console.log('✅ Fast-forward response:', ffRes.data.message);

  console.log('\n🎉 ALL BACKEND GROWTH PLAN TESTS PASSED WITH 100% SUCCESS!');
  process.exit(0);
}

testPlansFlow().catch(err => {
  console.error('Test failed:', err.response ? err.response.data : err.message);
  process.exit(1);
});
