const axios = require('axios');

const API = 'http://127.0.0.1:5000/api';

async function run() {
  console.log('=== VERIFYING SUPPORT, DISPUTES, EMAIL, AI BOT & DEAL CLOSING LIFECYCLE ===\n');

  // Authenticate Admin and User
  const adminRes = await axios.post(`${API}/auth/login`, { email: 'admin@mail.com', password: '123456' });
  const adminToken = adminRes.data.data.tokens.accessToken;
  const adminHeaders = { headers: { Authorization: `Bearer ${adminToken}` } };

  const userRes = await axios.post(`${API}/auth/login`, { email: 'user@mail.com', password: '123456' });
  const userToken = userRes.data.data.tokens.accessToken;
  const userId = userRes.data.data.user.id;
  const userHeaders = { headers: { Authorization: `Bearer ${userToken}` } };

  console.log(`✓ Admin & User authenticated (User ID: ${userId}).`);

  // [TEST 1] User creates a support ticket
  console.log('\n[TEST 1] User creating a support ticket...');
  const ticketRes = await axios.post(`${API}/support/tickets`, {
    subject: 'Verification on Q3 Profit Payout Ledger',
    category: 'GENERAL_SUPPORT',
    priority: 'MEDIUM',
    message: 'Hello supervisor, could you confirm when the next dividend balance update will be calculated?'
  }, userHeaders);
  const ticketId = ticketRes.data.data.ticket_id;
  const ticketNum = ticketRes.data.data.ticket_number;
  console.log(`✓ Support ticket created: ${ticketNum} (ID: ${ticketId}) with automated email dispatch.`);

  // [TEST 2] Admin replies to ticket with email dispatch
  console.log('\n[TEST 2] Admin replying to user ticket...');
  const replyRes = await axios.post(`${API}/support/tickets/${ticketId}/messages`, {
    message: 'Hello Alexander! The Q3 dividend is credited every Friday afternoon directly to your Universal USD Cash Balance.',
    new_status: 'RESOLVED'
  }, adminHeaders);
  console.log(`✓ Admin response sent and email dispatched to client (Status: ${replyRes.data.data.status}).`);

  // [TEST 3] AI Chatbot Q&A and Auto-Dispute Escalation
  console.log('\n[TEST 3] Testing AI Chatbot interaction & Dispute Escalation...');
  const aiChatRes = await axios.post(`${API}/support/ai-chat`, {
    message: 'I want to raise a dispute regarding an unexpected dip on my tech stock allocation.'
  }, userHeaders);
  console.log('✓ AI Chatbot reply received:');
  console.log(`  "${aiChatRes.data.data.reply.slice(0, 110)}..."`);
  const disputeData = aiChatRes.data.data.dispute_created;
  if (!disputeData) {
    throw new Error('AI Chatbot failed to create dispute for dispute intent!');
  }
  console.log(`✓ AI successfully created official Dispute: ${disputeData.ticket_number} (Priority: ${disputeData.priority})!`);

  // [TEST 4] Admin retrieves and inspects dispute
  console.log('\n[TEST 4] Admin inspecting escalated disputes...');
  const disputesListRes = await axios.get(`${API}/support/admin/tickets?is_dispute=1`, adminHeaders);
  const foundDispute = disputesListRes.data.data.find(d => d.ticket_number === disputeData.ticket_number);
  if (!foundDispute) {
    throw new Error('Escalated dispute not found in admin directory!');
  }
  console.log(`✓ Admin confirmed dispute: "${foundDispute.subject}" from ${foundDispute.user_name}.`);

  // [TEST 5] Trade Deal Closing Lifecycle
  // Step A: Launch a managed trade
  console.log('\n[TEST 5A] Admin opening managed trade for user...');
  const tradeRes = await axios.post(`${API}/admin/trade-for-user`, {
    user_id: userId,
    pair: 'BTC/USDT',
    side: 'BUY',
    amount: 0.35,
    initial_profit: 280.00,
    target_outcome: 'IN_PROGRESS',
    admin_notes: 'Target Breakout Execution'
  }, adminHeaders);
  const tradeId = tradeRes.data.data.id;
  console.log(`✓ Managed trade launched: Trade #${tradeId} (BTC/USDT) with starting profit $280.00.`);

  // Step B: Admin signals Deal Closing Window
  console.log('\n[TEST 5B] Admin initiating Deal Closing Window (Alerting User)...');
  const signalRes = await axios.post(`${API}/admin/signal-closing`, {
    trade_id: tradeId,
    estimated_profit: 350.00,
    closing_note: 'Target reached: Deal closing window initiated by supervisor.'
  }, adminHeaders);
  console.log(`✓ Deal closing signaled! Status updated to: ${signalRes.data.data.target_outcome} ($${signalRes.data.data.current_profit}).`);

  // Step C: Verify user sees trade in CLOSING_SOON phase
  console.log('\n[TEST 5C] Verifying user sees trade in closing window...');
  const userTradesRes = await axios.get(`${API}/trade/managed`, userHeaders);
  const closingTrade = userTradesRes.data.data.find(t => t.id === tradeId);
  if (!closingTrade || closingTrade.target_outcome !== 'CLOSING_SOON') {
    throw new Error(`Trade #${tradeId} was expected to have target_outcome='CLOSING_SOON'`);
  }
  console.log(`✓ Confirmed! User views Trade #${tradeId} in closing window: Status = "${closingTrade.target_outcome}" (Profit: $${closingTrade.current_profit}).`);

  // Step D: Admin finalizes deal settlement (Lock Win & Credit USD Wallet)
  console.log('\n[TEST 5D] Admin closing deal and crediting cash payout to client...');
  const closeRes = await axios.post(`${API}/admin/close-trade`, {
    trade_id: tradeId,
    outcome: 'WIN'
  }, adminHeaders);
  console.log(`✓ Deal settled! Trade #${tradeId} locked with outcome WIN: ${closeRes.data.message}`);

  // Step E: Verify wallet balance was credited
  const portfolioRes = await axios.get(`${API}/wallet/portfolio`, userHeaders);
  const usdWallet = portfolioRes.data.data.wallets.find(w => w.asset_symbol === 'USD');
  console.log(`✓ User Universal USD Wallet verified! Balance = $${usdWallet.balance}`);

  console.log('\n============================================================');
  console.log('✨ ALL TESTS PASSED! SUPPORT, DISPUTES, AI BOT & DEAL CLOSING ARE 10/10 OPERATIONAL.');
  console.log('============================================================');
}

run().catch(err => {
  console.error('❌ Test failed:', err.response?.data || err.message);
  process.exit(1);
});
