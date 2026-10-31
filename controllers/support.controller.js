const db = require('../config/db');
const emailService = require('../services/email.service');
const { notifyUser, getIO } = require('../sockets/market.socket');
const logger = require('../config/logger');

// Generate unique Ticket / Dispute reference
function generateTicketNumber(isDispute = false) {
  const prefix = isDispute ? 'DISPUTE-' : 'TIC-';
  const random = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}${random}`;
}

// =========================================================================
// USER TICKET & EMAIL ACTIONS
// =========================================================================

exports.getUserTickets = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [tickets] = await db.query(
      `SELECT t.*, 
              (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id) as message_count,
              (SELECT m.message FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) as last_message,
              (SELECT m.created_at FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) as last_message_at,
              (SELECT m.sender_role FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) as last_sender_role
       FROM support_tickets t
       WHERE t.user_id = ?
       ORDER BY t.updated_at DESC`,
      [userId]
    );

    res.json({ success: true, data: tickets });
  } catch (error) {
    next(error);
  }
};

exports.getTicketDetails = async (req, res, next) => {
  try {
    const ticketId = req.params.id;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    let query = `
      SELECT t.*, u.full_name as user_name, u.email as user_email, u.account_id
      FROM support_tickets t
      JOIN app_users u ON t.user_id = u.id
      WHERE t.id = ?
    `;
    const params = [ticketId];

    if (!isAdmin) {
      query += ` AND t.user_id = ?`;
      params.push(userId);
    }

    const [rows] = await db.query(query, params);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found or access denied' });
    }

    const ticket = rows[0];

    const [messages] = await db.query(
      `SELECT * FROM support_messages WHERE ticket_id = ? ORDER BY id ASC`,
      [ticketId]
    );

    res.json({
      success: true,
      data: {
        ticket,
        messages
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.createTicket = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { subject, category, priority, message, is_dispute, related_trade_id, source, ai_summary } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ success: false, error: 'Subject and message are required' });
    }

    const disputeFlag = is_dispute ? 1 : 0;
    const ticketNum = generateTicketNumber(disputeFlag === 1);
    const cat = category || (disputeFlag === 1 ? 'TRADE_DISPUTE' : 'GENERAL_SUPPORT');
    const prio = priority || (disputeFlag === 1 ? 'URGENT' : 'MEDIUM');
    const src = source || 'USER_SUBMITTED';

    // 1. Insert Ticket
    const [ticketRes] = await db.query(
      `INSERT INTO support_tickets 
       (ticket_number, user_id, subject, category, priority, status, is_dispute, related_trade_id, source, ai_summary)
       VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)`,
      [ticketNum, userId, subject, cat, prio, disputeFlag, related_trade_id || null, src, ai_summary || null]
    );

    const ticketId = ticketRes.insertId;

    // 2. Insert First Message
    const [userRows] = await db.query('SELECT full_name, email, account_id FROM app_users WHERE id = ?', [userId]);
    const user = userRows[0];

    await db.query(
      `INSERT INTO support_messages 
       (ticket_id, sender_id, sender_role, sender_name, sender_email, message, is_email_dispatched)
       VALUES (?, ?, 'USER', ?, ?, ?, 1)`,
      [ticketId, userId, user.full_name, user.email, message]
    );

    // 3. Dispatch Email Notifications
    emailService.sendTicketCreatedEmail(user.email, user.full_name, ticketNum, subject, message, disputeFlag === 1).catch(err => {
      logger.warn('[Support] Client email notification error:', err.message);
    });

    if (disputeFlag === 1 || prio === 'URGENT') {
      emailService.sendAdminDisputeAlert('admin@mail.com', user, {
        ticket_number: ticketNum,
        subject,
        message,
        ai_summary
      }).catch(err => {
        logger.warn('[Support] Admin dispute alert email error:', err.message);
      });
    }

    // 4. Socket.IO Broadcast to Admin HUD & User
    const io = getIO();
    if (io) {
      io.emit('support:ticket_created', {
        id: ticketId,
        ticket_number: ticketNum,
        user_id: userId,
        user_name: user.full_name,
        subject,
        category: cat,
        priority: prio,
        is_dispute: disputeFlag === 1,
        created_at: new Date()
      });

      if (disputeFlag === 1) {
        io.emit('admin:dispute_alert', {
          ticket_id: ticketId,
          ticket_number: ticketNum,
          user_name: user.full_name,
          account_id: user.account_id,
          subject,
          ai_summary,
          message
        });
      }
    }

    res.status(201).json({
      success: true,
      message: disputeFlag === 1 
        ? `Dispute ${ticketNum} escalated to senior supervisor. Email notification dispatched.` 
        : `Support ticket ${ticketNum} opened successfully. Confirmation email sent.`,
      data: {
        ticket_id: ticketId,
        ticket_number: ticketNum
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.addMessage = async (req, res, next) => {
  try {
    const ticketId = req.params.id;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const { message, new_status } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, error: 'Message cannot be empty' });
    }

    // Verify ticket exists
    const [ticketRows] = await db.query(
      `SELECT t.*, u.full_name as user_name, u.email as user_email 
       FROM support_tickets t 
       JOIN app_users u ON t.user_id = u.id 
       WHERE t.id = ?`,
      [ticketId]
    );

    if (ticketRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const ticket = ticketRows[0];
    if (!isAdmin && ticket.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const [senderRows] = await db.query('SELECT full_name, email FROM app_users WHERE id = ?', [userId]);
    const sender = senderRows[0];
    const senderRole = isAdmin ? 'ADMIN' : 'USER';
    const senderName = isAdmin ? 'Senior Broker / Supervisor' : sender.full_name;

    // Insert Message
    const [msgRes] = await db.query(
      `INSERT INTO support_messages 
       (ticket_id, sender_id, sender_role, sender_name, sender_email, message, is_email_dispatched)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [ticketId, userId, senderRole, senderName, sender.email, message]
    );

    // Update Ticket updated_at and optionally status
    let updatedStatus = new_status || ticket.status;
    if (isAdmin && !new_status && ticket.status === 'OPEN') {
      updatedStatus = 'IN_REVIEW';
    } else if (!isAdmin && ticket.status === 'RESOLVED') {
      updatedStatus = 'OPEN';
    }

    await db.query(
      `UPDATE support_tickets SET status = ?, updated_at = NOW() WHERE id = ?`,
      [updatedStatus, ticketId]
    );

    // Email dispatch:
    // If admin replied, send email to user
    // If user replied, send email to admin
    if (isAdmin) {
      emailService.sendNewMessageEmail(
        ticket.user_email,
        ticket.user_name,
        'Senior Broker / Supervisor',
        ticket.ticket_number,
        ticket.subject,
        message
      ).catch(e => logger.warn('[Support] User email notify error:', e.message));

      notifyUser(ticket.user_id, 'ticket:new_message', {
        ticket_id: ticket.id,
        ticket_number: ticket.ticket_number,
        sender_role: 'ADMIN',
        sender_name: senderName,
        message,
        status: updatedStatus
      });
    } else {
      emailService.sendNewMessageEmail(
        'admin@mail.com',
        'Senior Admin Desk',
        sender.full_name,
        ticket.ticket_number,
        ticket.subject,
        message
      ).catch(e => logger.warn('[Support] Admin email notify error:', e.message));

      const io = getIO();
      if (io) {
        io.emit('admin:ticket_reply', {
          ticket_id: ticket.id,
          ticket_number: ticket.ticket_number,
          user_name: sender.full_name,
          message
        });
      }
    }

    res.json({
      success: true,
      message: 'Message delivered and email notification sent.',
      data: {
        id: msgRes.insertId,
        ticket_id: parseInt(ticketId),
        sender_role: senderRole,
        sender_name: senderName,
        message,
        status: updatedStatus,
        created_at: new Date()
      }
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================================
// AI CHATBOT INTELLIGENT AGENT & DISPUTE ESCALATOR
// =========================================================================

exports.aiChatbotMessage = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { message, chat_history, auto_escalate } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, error: 'Message cannot be empty' });
    }

    const [userRows] = await db.query(
      'SELECT id, full_name, email, account_id FROM app_users WHERE id = ?',
      [userId]
    );
    const user = userRows[0];

    // Fetch user's active managed trades to give intelligent context
    const [trades] = await db.query(
      `SELECT id, pair, side, amount, current_profit, target_outcome 
       FROM trades WHERE user_id = ? AND is_managed = 1 
       ORDER BY id DESC LIMIT 5`,
      [userId]
    );

    const lower = message.toLowerCase().trim();

    // Check if user is requesting to raise a dispute or complaint
    const disputeTriggers = [
      'dispute', 'complain', 'complaint', 'scam', 'unfair', 'disagree', 
      'mistake', 'loss', 'problem', 'unhappy', 'escalate', 'supervisor', 
      'admin', 'wrong profit', 'broker error', 'stop trade', 'refund'
    ];

    const isDisputeIntent = disputeTriggers.some(trigger => lower.includes(trigger)) || auto_escalate;

    let aiResponse = '';
    let disputeCreated = null;

    if (isDisputeIntent && (lower.includes('yes') || lower.includes('raise') || lower.includes('dispute') || lower.includes('escalate') || auto_escalate)) {
      // Auto-escalate and create formal dispute ticket
      const ticketNum = generateTicketNumber(true);
      const subject = `AI Escalated Dispute: ${message.slice(0, 70)}...`;

      const aiSummary = `Client ${user.full_name} engaged AI Assistant with dispute intent. Problem statement: "${message}". Active Managed Trades: ${trades.length} positions.`;

      const [ticketRes] = await db.query(
        `INSERT INTO support_tickets 
         (ticket_number, user_id, subject, category, priority, status, is_dispute, source, ai_summary)
         VALUES (?, ?, ?, 'TRADE_DISPUTE', 'URGENT', 'OPEN', 1, 'AI_BOT_ESCALATED', ?)`,
        [ticketNum, userId, subject, aiSummary]
      );

      const ticketId = ticketRes.insertId;

      // Log AI notice message
      await db.query(
        `INSERT INTO support_messages 
         (ticket_id, sender_id, sender_role, sender_name, sender_email, message, is_email_dispatched)
         VALUES (?, NULL, 'AI_ASSISTANT', 'Fichain Pro AI Intelligence', 'ai-bot@fichain.pro', ?, 1)`,
        [ticketId, `🤖 AI Autonomous Escalation: I have created formal priority dispute #${ticketNum} and alerted our senior supervisor desk. Transcript: "${message}"`]
      );

      // Log user message
      await db.query(
        `INSERT INTO support_messages 
         (ticket_id, sender_id, sender_role, sender_name, sender_email, message, is_email_dispatched)
         VALUES (?, ?, 'USER', ?, ?, ?, 1)`,
        [ticketId, userId, user.full_name, user.email, message]
      );

      // Alert Admin via Email and Socket
      emailService.sendAdminDisputeAlert('admin@mail.com', user, {
        ticket_number: ticketNum,
        subject,
        message,
        ai_summary: aiSummary
      }).catch(err => logger.warn('[AI Bot] Email alert error:', err.message));

      const io = getIO();
      if (io) {
        io.emit('admin:dispute_alert', {
          ticket_id: ticketId,
          ticket_number: ticketNum,
          user_name: user.full_name,
          account_id: user.account_id,
          subject,
          ai_summary: aiSummary,
          message
        });
      }

      disputeCreated = {
        ticket_id: ticketId,
        ticket_number: ticketNum,
        subject,
        priority: 'URGENT'
      };

      aiResponse = `I have immediately opened priority **Dispute Case #${ticketNum}** on your behalf and notified our Senior Supervisor Desk via email and real-time alert. 

Your complaint regarding: *" ${message} "* is now in priority review. A senior broker will inspect the trade executions and reply to you directly in your Support Portal. You can track this ticket anytime under Support & Disputes.`;

    } else if (isDisputeIntent) {
      aiResponse = `I understand you have a concern with your trade execution or account balance. 

As your Fichain Pro Institutional Assistant, I can immediately raise a **Formal Trade Dispute** to our Senior Supervisor Desk. Would you like me to open an official priority dispute ticket for you right now? Simply reply **"Yes, raise dispute"** or describe what you'd like investigated.`;

    } else if (lower.includes('deposit') || lower.includes('add funds') || lower.includes('how to deposit')) {
      aiResponse = `Depositing funds into your Fichain Pro account is simple and instant:
1. Navigate to **Deposit & Cash Out** from your menu.
2. Select your preferred currency (e.g. USDT, BTC, or Wire).
3. Scan the dynamic QR code or use the instant test credit to practice.
Once deposited, your capital is immediately available for our senior trading desk to allocate into high-yield positions!`;

    } else if (lower.includes('withdraw') || lower.includes('cash out') || lower.includes('payout')) {
      aiResponse = `To cash out your profits:
1. Go to **Deposit & Cash Out** > **Cash Out Profits**.
2. Enter the amount you wish to withdraw and destination wallet address.
3. An automated **6-Digit Security PIN** will be sent to your email for institutional 2-step verification.
4. Enter the PIN to finalize your withdrawal instantly.`;

    } else if (lower.includes('managed') || lower.includes('how does trading work') || lower.includes('earnings') || lower.includes('profit')) {
      const activeCount = trades.filter(t => t.target_outcome === 'IN_PROGRESS').length;
      aiResponse = `On Fichain Pro, you don't need technical trading knowledge! Our **Senior Institutional Brokers** execute managed trades on your behalf.
Currently, your account has **${activeCount} active position(s)** running in the market.
Your profits tick in real time on your dashboard every 5 seconds. When the supervisor closes a deal, your profit is locked in and credited directly to your universal USD cash balance!`;

    } else if (lower.includes('card') || lower.includes('virtual card')) {
      aiResponse = `You have access to 3D Virtual Visa and Mastercard debit cards linked directly to your balance. You can view card numbers and CVV by entering your 4-digit PIN (default demo PIN: **1234**), and you can freeze or unfreeze cards with 1 click.`;

    } else {
      aiResponse = `Hello ${user.full_name.split(' ')[0]}! I am your **Fichain Pro Institutional AI Assistant**. 

I can assist you with:
- Explaining your **Live Managed Earnings** & broker positions
- Guiding you through **Deposits & 2-Step Withdrawals**
- Explaining **Virtual Cards & KYC Compliance**
- **Raising a Priority Dispute to Senior Admins** if you have any issue with a trade

How can I help you today?`;
    }

    res.json({
      success: true,
      data: {
        reply: aiResponse,
        dispute_created: disputeCreated,
        timestamp: new Date()
      }
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================================
// ADMIN TICKET & DISPUTE CONTROLLER
// =========================================================================

exports.getAllTicketsAdmin = async (req, res, next) => {
  try {
    const { is_dispute, status, category, priority } = req.query;

    let query = `
      SELECT t.*, u.full_name as user_name, u.email as user_email, u.account_id,
             (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id) as message_count,
             (SELECT m.message FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) as last_message,
             (SELECT m.created_at FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) as last_message_at,
             (SELECT m.sender_role FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) as last_sender_role
      FROM support_tickets t
      JOIN app_users u ON t.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (is_dispute !== undefined) {
      query += ` AND t.is_dispute = ?`;
      params.push(is_dispute === 'true' || is_dispute === '1' ? 1 : 0);
    }
    if (status) {
      query += ` AND t.status = ?`;
      params.push(status);
    }
    if (category) {
      query += ` AND t.category = ?`;
      params.push(category);
    }
    if (priority) {
      query += ` AND t.priority = ?`;
      params.push(priority);
    }

    query += ` ORDER BY t.is_dispute DESC, t.updated_at DESC LIMIT 100`;

    const [tickets] = await db.query(query, params);
    res.json({ success: true, data: tickets });
  } catch (error) {
    next(error);
  }
};

exports.updateTicketStatusAdmin = async (req, res, next) => {
  try {
    const ticketId = req.params.id;
    const { status, priority, admin_note } = req.body;

    const [ticketRows] = await db.query('SELECT * FROM support_tickets WHERE id = ?', [ticketId]);
    if (ticketRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const ticket = ticketRows[0];
    const newStatus = status || ticket.status;
    const newPriority = priority || ticket.priority;

    await db.query(
      `UPDATE support_tickets SET status = ?, priority = ?, updated_at = NOW() WHERE id = ?`,
      [newStatus, newPriority, ticketId]
    );

    if (admin_note) {
      await db.query(
        `INSERT INTO support_messages 
         (ticket_id, sender_id, sender_role, sender_name, sender_email, message, is_email_dispatched)
         VALUES (?, ?, 'ADMIN', 'Supervisor Desk Note', 'admin@mail.com', ?, 1)`,
        [ticketId, req.user.id, admin_note]
      );
    }

    notifyUser(ticket.user_id, 'ticket:status_change', {
      ticket_id: ticket.id,
      ticket_number: ticket.ticket_number,
      status: newStatus,
      priority: newPriority,
      note: admin_note
    });

    res.json({
      success: true,
      message: `Ticket ${ticket.ticket_number} status updated to ${newStatus}`,
      data: { status: newStatus, priority: newPriority }
    });
  } catch (error) {
    next(error);
  }
};
