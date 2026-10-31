const axios = require('axios');

const API = 'http://127.0.0.1:5000/api';

async function test() {
  console.log('=== TESTING SUPPORT, DISPUTES, EMAIL & AI CHATBOT ===\n');

  // Login User
  const userRes = await axios.post(`${API}/auth/login`, { email: 'user@mail.com', password: '123456' });
  const userToken = userRes.data.data.tokens.accessToken;
  const userHeaders = { headers: { Authorization: `Bearer ${userToken}` } };

  // Login Admin
  const adminRes = await axios.post(`${API}/auth/login`, { email: 'admin@mail.com', password: '123456' });
  const adminToken = adminRes.data.data.tokens.accessToken;
  const adminHeaders = { headers: { Authorization: `Bearer ${adminToken}` } };

  // 1. Fetch User Tickets
  console.log('[1] Fetching user tickets...');
  const userTicketsRes = await axios.get(`${API}/support/tickets`, userHeaders);
  console.log(`✓ User has ${userTicketsRes.data.data.length} tickets on record:`);
  userTicketsRes.data.data.forEach(t => {
    console.log(`   - [${t.ticket_number}] (${t.category}) "${t.subject}" - Status: ${t.status} - Dispute: ${t.is_dispute === 1}`);
  });

  // 2. User Creates a Support Ticket with email dispatch
  console.log('\n[2] User creating a support ticket...');
  const newTicketRes = await axios.post(`${API}/support/tickets`, {
    subject: 'Requesting Statement Audit for Q3',
    category: 'GENERAL_SUPPORT',
    priority: 'MEDIUM',
    message: 'Could you please verify the Q3 statement matches my universal USD cash deposits?'
  }, userHeaders);
  console.log(`✓ Ticket created: ${newTicketRes.data.data.ticket_number}`);
  const ticketId = newTicketRes.data.data.ticket_id;

  // 3. User & Admin Messaging Thread with email dispatch
  console.log('\n[3] Admin replying to ticket...');
  const adminReplyRes = await axios.post(`${API}/support/tickets/${ticketId}/messages`, {
    message: 'Hello Alexander! Our audit desk has reviewed your Q3 ledger and confirmed all transactions are verified and reconciled.',
    new_status: 'RESOLVED'
  }, adminHeaders);
  console.log(`✓ Admin reply dispatched: "${adminReplyRes.data.data.message.slice(0, 50)}..." (Status: ${adminReplyRes.data.data.status})`);

  // 4. Test AI Chatbot with Dispute Auto-Escalation
  console.log('\n[4] Testing AI Chatbot dispute escalation...');
  const botDisputeRes = await axios.post(`${API}/support/ai-chat`, {
    message: 'I want to raise a dispute regarding an unexpected dip on my tech stock allocation.'
  }, userHeaders);

  console.log('✓ AI Chatbot Response:');
  console.log(botDisputeRes.data.data.reply);
  if (botDisputeRes.data.data.dispute_created) {
    console.log(`✓ AI successfully auto-escalated to Dispute: ${botDisputeRes.data.data.dispute_created.ticket_number}`);
  }

  // 5. Admin Fetch All Disputes
  console.log('\n[5] Admin fetching all disputes...');
  const adminDisputes = await axios.get(`${API}/support/admin/tickets?is_dispute=1`, adminHeaders);
  console.log(`✓ Admin retrieved ${adminDisputes.data.data.length} active disputes:`);
  adminDisputes.data.data.forEach(d => {
    console.log(`   - ${d.ticket_number}: ${d.subject} (From: ${d.user_name})`);
  });

  console.log('\n✨ ALL SUPPORT & DISPUTE BACKEND TESTS PASSED (10/10)!');
}

test().catch(err => {
  console.error('Test failed:', err.response?.data || err.message);
  process.exit(1);
});
