const db = require('../config/db');
const marketStream = require('../services/marketStream.service');
const emailService = require('../services/email.service');
const statementService = require('../services/statement.service');
const crypto = require('crypto');

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

// Simulated Instant Deposit Sandbox
exports.sandboxDeposit = async (req, res, next) => {
  try {
    const { asset, amount, tx_hash } = req.body;
    const numAmount = parseFloat(amount);

    if (!asset || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Valid asset and amount are required' });
    }

    let usdPrice = 1.0;
    if (asset !== 'USD' && asset !== 'USDT') {
      const ticker = marketStream.getTicker(`${asset}/USDT`);
      if (ticker) usdPrice = ticker.price;
    }
    const amountUsd = parseFloat((numAmount * usdPrice).toFixed(2));

    // Credit user wallet
    await db.query(
      `INSERT INTO user_wallets (user_id, asset_symbol, asset_name, balance)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance)`,
      [req.user.id, asset.toUpperCase(), asset.toUpperCase(), numAmount]
    );

    // Record completed transaction
    const hash = tx_hash || `0x${crypto.randomBytes(32).toString('hex')}`;
    const [txRes] = await db.query(
      `INSERT INTO transactions (user_id, type, asset_symbol, network, amount, amount_usd, status, tx_hash, notes)
       VALUES (?, 'deposit', ?, 'Simulated Network', ?, ?, 'completed', ?, 'Sandbox Instant Deposit Confirmed')`,
      [req.user.id, asset.toUpperCase(), numAmount, amountUsd, hash]
    );

    res.status(201).json({
      success: true,
      message: `Deposit of ${numAmount} ${asset} ($${amountUsd}) confirmed and credited`,
      data: { tx_id: txRes.insertId, tx_hash: hash }
    });
  } catch (error) {
    next(error);
  }
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
