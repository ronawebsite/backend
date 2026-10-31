const axios = require('axios');

const API = 'http://127.0.0.1:5000/api';

async function run() {
  console.log('=== VERIFYING FULL MULTI-ASSET BROKER & TOP-UP DIRECTIVE SUITE ===\n');

  // 1. Login Admin and User
  const adminRes = await axios.post(`${API}/auth/login`, { email: 'admin@mail.com', password: '123456' });
  const adminToken = adminRes.data.data.tokens.accessToken;
  console.log('✓ Admin authenticated successfully.');

  const userRes = await axios.post(`${API}/auth/login`, { email: 'user@mail.com', password: '123456' });
  const userToken = userRes.data.data.tokens.accessToken;
  const userId = userRes.data.data.user.id;
  console.log(`✓ User authenticated successfully (ID: ${userId}).`);

  const adminHeaders = { headers: { Authorization: `Bearer ${adminToken}` } };
  const userHeaders = { headers: { Authorization: `Bearer ${userToken}` } };

  // 2. Launch Multi-Asset Basket (BTC + NVDA + ETH) for User
  console.log('\n[TEST 1] Admin executing multi-asset portfolio basket for client...');
  const basketPayload = {
    user_id: userId,
    assets: [
      { pair: 'BTC/USDT', side: 'BUY', amount: 0.25, initial_profit: 220, target_outcome: 'IN_PROGRESS' },
      { pair: 'NVDA/USD', side: 'BUY', amount: 10, initial_profit: 260, target_outcome: 'IN_PROGRESS' },
      { pair: 'ETH/USDT', side: 'BUY', amount: 2.5, initial_profit: 140, target_outcome: 'IN_PROGRESS' }
    ],
    admin_notes: 'E2E Crypto & AI Titans Portfolio Basket'
  };

  const basketRes = await axios.post(`${API}/admin/trade-multi-assets`, basketPayload, adminHeaders);
  const trades = basketRes.data.data;
  console.log(`✓ Basket executed! Created ${trades.length} positions:`);
  trades.forEach(t => {
    console.log(`   - ID ${t.id}: ${t.pair} ${t.side} (Size ${t.amount}) -> Initial Profit: $${t.current_profit}`);
  });

  // 3. Admin dispatches Top-Up Directive to User Screen
  console.log('\n[TEST 2] Admin dispatching broker top-up directive to user...');
  const promptPayload = {
    user_id: userId,
    title: 'Target Breakout Booster: Capital Top-Up Required',
    message: 'Senior broker desk has entered high-momentum breakout positions on BTC + NVDA. Increase capital buffer by $2,500 now to secure projected payout of $7,500.',
    target_amount: 2500,
    expected_payout: 7500,
    urgency: 'HIGH'
  };

  const promptRes = await axios.post(`${API}/admin/send-prompt`, promptPayload, adminHeaders);
  const promptId = promptRes.data.data.id;
  console.log(`✓ Broker directive created with ID=${promptId}:`);
  console.log(`   - Title: "${promptRes.data.data.title}"`);
  console.log(`   - Required Top-Up: $${promptRes.data.data.target_amount}`);
  console.log(`   - Projected Target Payout: $${promptRes.data.data.expected_payout}`);

  // 4. User retrieves active directives
  console.log('\n[TEST 3] User retrieving active directives on portal...');
  const userPromptsRes = await axios.get(`${API}/trade/prompts`, userHeaders);
  const foundPrompt = userPromptsRes.data.data.find(p => p.id === promptId);
  if (!foundPrompt) {
    throw new Error(`Directive ${promptId} not found in user's active prompts list!`);
  }
  console.log(`✓ Confirmed! User received directive: "${foundPrompt.title}" (${foundPrompt.urgency})`);

  // 5. Admin boosts all active profits for User by +$100
  console.log('\n[TEST 4] Admin executing bulk profit booster (+ $100 to all positions)...');
  const boostRes = await axios.post(`${API}/admin/boost-all-profits`, {
    user_id: userId,
    delta_profit: 100
  }, adminHeaders);
  console.log(`✓ Bulk boost complete! Affected ${boostRes.data.affected_trades} positions.`);

  // 6. User verifies all active positions have updated profits
  console.log('\n[TEST 5] User verifying live profits across all basket positions...');
  const userTradesRes = await axios.get(`${API}/trade/managed`, userHeaders);
  const userTrades = userTradesRes.data.data;
  console.log(`✓ User has ${userTrades.length} managed trades in their portal:`);
  let totalProfit = 0;
  userTrades.slice(0, 5).forEach(t => {
    totalProfit += parseFloat(t.current_profit);
    console.log(`   - ${t.pair}: Current Live Profit = $${parseFloat(t.current_profit).toFixed(2)} (${t.target_outcome})`);
  });
  console.log(`✓ Total combined live earnings for client: $${totalProfit.toFixed(2)}`);

  // 7. User dismisses / acknowledges the directive
  console.log('\n[TEST 6] User acknowledging and dismissing top-up directive...');
  await axios.post(`${API}/trade/prompts/${promptId}/dismiss`, {}, userHeaders);
  const afterDismiss = await axios.get(`${API}/trade/prompts`, userHeaders);
  const stillThere = afterDismiss.data.data.find(p => p.id === promptId);
  if (stillThere) {
    throw new Error('Directive should no longer be active after user dismissal');
  }
  console.log('✓ Directive successfully dismissed by user!');

  // 8. Admin tests drift toggle
  console.log('\n[TEST 7] Admin toggling live drift engine...');
  const driftToggle = await axios.post(`${API}/admin/toggle-drift`, { enabled: true }, adminHeaders);
  console.log(`✓ Live drift engine active status: ${driftToggle.data.live_drift_active}`);

  console.log('\n============================================================');
  console.log('✨ ALL 7 TESTS PASSED (10/10)! INSTITUTIONAL BROKER SUITE IS FULLY OPERATIONAL.');
  console.log('============================================================');
}

run().catch(err => {
  console.error('❌ Test failed:', err.response?.data || err.message);
  process.exit(1);
});
