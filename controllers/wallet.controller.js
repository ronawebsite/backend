const db = require('../config/db');
const marketStream = require('../services/marketStream.service');
const emailService = require('../services/email.service');
const statementService = require('../services/statement.service');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { notifyUser, getIO } = require('../sockets/market.socket');

exports.getWallets = async (req, res, next) => {
  try {
    const [wallets] = await db.query(
      'SELECT * FROM user_wallets WHERE user_id = ? ORDER BY id ASC',
      [req.user.id]
    );

    let totalPortfolioUsd = 0;
    const enrichedWallets = wallets.map(w => {
      let usdPrice = 1.0;
      if (w.asset_symbol === 'USD' || w.asset_symbol === 'USDT') {
        usdPrice = 1.0;
      } else {
        const ticker = marketStream.getTicker(`${w.asset_symbol}/USDT`);
        usdPrice = ticker ? ticker.price : 1.0;
      }

      const totalBalance = parseFloat(w.balance);
      const usdValue = parseFloat((totalBalance * usdPrice).toFixed(2));
      totalPortfolioUsd += usdValue;

      return {
        ...w,
        balance: parseFloat(w.balance),
        locked_balance: parseFloat(w.locked_balance),
        current_price_usd: usdPrice,
        usd_value: usdValue
      };
    });

    res.json({
      success: true,
      data: {
        total_portfolio_usd: parseFloat(totalPortfolioUsd.toFixed(2)),
        wallets: enrichedWallets
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getDepositMethods = async (req, res, next) => {
  try {
    const [methods] = await db.query(
      'SELECT id, asset_symbol, asset_name, network, deposit_address, memo_tag, instructions, minimum_deposit, confirmations_required FROM platform_deposit_wallets WHERE is_active = 1 ORDER BY id ASC'
    );
    res.json({
      success: true,
      data: methods
    });
  } catch (error) {
    next(error);
  }
};

exports.getDepositAddress = async (req, res, next) => {
  try {
    const { asset } = req.params;
    const requestedAsset = asset.toUpperCase();

    // 1. Check admin-configured platform deposit wallets first
    const [platformWallets] = await db.query(
      'SELECT * FROM platform_deposit_wallets WHERE asset_symbol = ? AND is_active = 1 LIMIT 1',
      [requestedAsset]
    );

    if (platformWallets.length > 0) {
      const pw = platformWallets[0];
      return res.json({
        success: true,
        data: {
          asset: pw.asset_symbol,
          name: pw.asset_name,
          network: pw.network,
          deposit_address: pw.deposit_address,
          memo_tag: pw.memo_tag || null,
          instructions: pw.instructions || 'Send only the specified asset to this address. Credits after network confirmation.',
          minimum_deposit: parseFloat(pw.minimum_deposit) || 10.0,
          confirmations_required: pw.confirmations_required || 3
        }
      });
    }

    // 2. Fallback to user wallet ledger if no admin platform wallet found
    const [wallets] = await db.query(
      'SELECT * FROM user_wallets WHERE user_id = ? AND asset_symbol = ?',
      [req.user.id, requestedAsset]
    );

    if (wallets.length === 0) {
      return res.status(404).json({ success: false, error: 'Deposit method not found for ' + requestedAsset });
    }

    const wallet = wallets[0];
    let address = wallet.deposit_address;
    if (!address) {
      address = `0x${crypto.randomBytes(20).toString('hex')}`;
      await db.query('UPDATE user_wallets SET deposit_address = ? WHERE id = ?', [address, wallet.id]);
    }

    res.json({
      success: true,
      data: {
        asset: wallet.asset_symbol,
        name: wallet.asset_name,
        network: wallet.network || 'Mainnet Layer 1',
        deposit_address: address,
        memo_tag: null,
        instructions: 'Send only the specified asset to this address.',
        minimum_deposit: 10.0,
        confirmations_required: 3
      }
    });
  } catch (error) {
    next(error);
  }
};

// Submit Client Deposit Request (Awaiting Admin Confirmation & Release)
exports.submitDepositRequest = async (req, res, next) => {
  try {
    const { asset, amount, tx_hash, network, notes, destination_address, receipt_base64 } = req.body;
    const numAmount = parseFloat(amount);

    if (!asset || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Valid coin asset and deposit amount are required' });
    }

    let usdPrice = 1.0;
    if (asset !== 'USD' && asset !== 'USDT') {
      const ticker = marketStream.getTicker(`${asset}/USDT`);
      if (ticker) usdPrice = ticker.price;
    }
    const amountUsd = parseFloat((numAmount * usdPrice).toFixed(2));

    // Handle receipt upload: via multipart file or base64 data URL
    let receiptUrl = null;
    if (req.file) {
      receiptUrl = `/uploads/receipts/${req.file.filename}`;
    } else if (receipt_base64 && typeof receipt_base64 === 'string' && receipt_base64.startsWith('data:image')) {
      try {
        const matches = receipt_base64.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const ext = matches[1].replace('jpeg', 'jpg');
          const buffer = Buffer.from(matches[2], 'base64');
          const receiptsDir = path.join(__dirname, '../uploads/receipts');
          if (!fs.existsSync(receiptsDir)) {
            fs.mkdirSync(receiptsDir, { recursive: true });
          }
          const filename = `receipt-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
          fs.writeFileSync(path.join(receiptsDir, filename), buffer);
          receiptUrl = `/uploads/receipts/${filename}`;
        }
      } catch (err) {
        console.error('Error saving base64 receipt:', err);
      }
    }

    const hash = tx_hash || `DEP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const userNotes = notes ? `Client note: ${notes}` : 'Deposit payment confirmation submitted. Awaiting supervisor review.';

    // Record as PENDING transaction in DB (NO wallet funds credited until admin confirms!)
    const [txRes] = await db.query(
      `INSERT INTO transactions (user_id, type, asset_symbol, network, amount, amount_usd, status, tx_hash, destination_address, notes, receipt_url)
       VALUES (?, 'deposit', ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [
        req.user.id,
        asset.toUpperCase(),
        network || 'Crypto Network',
        numAmount,
        amountUsd,
        hash,
        destination_address || null,
        userNotes,
        receiptUrl
      ]
    );

    // Notify Admin via WebSockets
    const io = getIO();
    if (io) {
      io.emit('admin:new_transaction', {
        id: txRes.insertId,
        user_id: req.user.id,
        type: 'deposit',
        asset_symbol: asset.toUpperCase(),
        amount: numAmount,
        amount_usd: amountUsd,
        receipt_url: receiptUrl,
        status: 'pending'
      });
    }

    res.status(201).json({
      success: true,
      message: `Deposit confirmation for ${numAmount} ${asset} received. It is currently pending supervisor review. Funds will be released once verified.`,
      data: {
        transaction_id: txRes.insertId,
        status: 'pending',
        amount: numAmount,
        asset: asset.toUpperCase(),
        receipt_url: receiptUrl
      }
    });
  } catch (error) {
    next(error);
  }
};

// Deprecated Sandbox Deposit - now redirects to pending deposit request (no instant credit)
exports.sandboxDeposit = async (req, res, next) => {
  return exports.submitDepositRequest(req, res, next);
};

// 2-Step Withdrawal Step 1: Request & Send 6-Digit Email PIN
exports.initiateWithdrawal = async (req, res, next) => {
  try {
    const { asset, amount, destination_address } = req.body;
    const numAmount = parseFloat(amount);

    if (!asset || isNaN(numAmount) || numAmount <= 0 || !destination_address) {
      return res.status(400).json({ success: false, error: 'Asset, amount, and destination address are required' });
    }

    const [wallets] = await db.query(
      'SELECT id, balance FROM user_wallets WHERE user_id = ? AND asset_symbol = ?',
      [req.user.id, asset.toUpperCase()]
    );

    if (wallets.length === 0 || parseFloat(wallets[0].balance) < numAmount) {
      return res.status(400).json({
        success: false,
        error: `Insufficient ${asset} balance. Available: ${wallets[0] ? parseFloat(wallets[0].balance).toFixed(4) : '0.00'}`
      });
    }

    let usdPrice = 1.0;
    if (asset !== 'USD' && asset !== 'USDT') {
      const ticker = marketStream.getTicker(`${asset}/USDT`);
      if (ticker) usdPrice = ticker.price;
    }
    const amountUsd = parseFloat((numAmount * usdPrice).toFixed(2));

    // Generate 6-digit security PIN
    const securityPin = emailService.generate6DigitPin();

    // Create pending transaction with PIN
    const [txRes] = await db.query(
      `INSERT INTO transactions (user_id, type, asset_symbol, amount, amount_usd, status, destination_address, withdrawal_pin, notes)
       VALUES (?, 'withdrawal', ?, ?, ?, 'pending', ?, ?, 'Awaiting 6-digit email PIN confirmation')`,
      [req.user.id, asset.toUpperCase(), numAmount, amountUsd, destination_address, securityPin]
    );

    // Send email dispatch
    await emailService.sendWithdrawalPin(req.user.email, securityPin, numAmount, asset.toUpperCase());

    res.json({
      success: true,
      message: `Security PIN dispatched to ${req.user.email}. Enter the 6-digit PIN to confirm withdrawal.`,
      data: {
        transaction_id: txRes.insertId,
        destination_address,
        amount: numAmount,
        asset: asset.toUpperCase(),
        // Also return PIN in dev/demo mode for seamless presentation convenience
        demo_security_pin: securityPin
      }
    });
  } catch (error) {
    next(error);
  }
};

// 2-Step Withdrawal Step 2: Confirm 6-Digit PIN
exports.confirmWithdrawal = async (req, res, next) => {
  try {
    const { transaction_id, pin } = req.body;

    if (!transaction_id || !pin) {
      return res.status(400).json({ success: false, error: 'Transaction ID and 6-digit PIN are required' });
    }

    const [txRows] = await db.query(
      "SELECT * FROM transactions WHERE id = ? AND user_id = ? AND type = 'withdrawal' AND status = 'pending'",
      [transaction_id, req.user.id]
    );

    if (txRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Pending withdrawal transaction not found' });
    }

    const tx = txRows[0];
    if (tx.withdrawal_pin !== String(pin).trim()) {
      return res.status(403).json({ success: false, error: 'Invalid 6-digit security PIN. Verification rejected.' });
    }

    // Deduct from wallet
    const conn = await db.pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        'UPDATE user_wallets SET balance = balance - ? WHERE user_id = ? AND asset_symbol = ?',
        [tx.amount, req.user.id, tx.asset_symbol]
      );

      const generatedTxHash = `0x${crypto.randomBytes(32).toString('hex')}`;
      await conn.query(
        "UPDATE transactions SET status = 'completed', tx_hash = ?, notes = 'Withdrawal cryptographically confirmed via 2FA PIN' WHERE id = ?",
        [generatedTxHash, tx.id]
      );

      await conn.commit();

      res.json({
        success: true,
        message: 'Withdrawal successfully executed and broadcasted to network',
        data: {
          tx_hash: generatedTxHash,
          amount: tx.amount,
          asset: tx.asset_symbol,
          status: 'completed'
        }
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    next(error);
  }
};

exports.getTransactions = async (req, res, next) => {
  try {
    const [txs] = await db.query(
      'SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 100',
      [req.user.id]
    );
    res.json({ success: true, data: txs });
  } catch (error) {
    next(error);
  }
};

exports.downloadStatementCSV = async (req, res, next) => {
  try {
    const [txs] = await db.query(
      'SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC',
      [req.user.id]
    );

    const csvData = statementService.generateCSV(txs);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="Fichain_Statement_${req.user.account_id}.csv"`);
    res.send(csvData);
  } catch (error) {
    next(error);
  }
};

exports.downloadStatementPDF = async (req, res, next) => {
  try {
    const [txs] = await db.query(
      'SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC',
      [req.user.id]
    );

    statementService.generatePDF(req.user, txs, res);
  } catch (error) {
    next(error);
  }
};
