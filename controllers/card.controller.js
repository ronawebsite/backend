const db = require('../config/db');

exports.getCards = async (req, res, next) => {
  try {
    const [cards] = await db.query(
      'SELECT id, card_holder_name, card_type, card_tier, status, balance, spending_limit, created_at, ' +
      "CONCAT('•••• •••• •••• ', RIGHT(card_number, 4)) as masked_number, '•••' as masked_cvv, expiry " +
      'FROM virtual_cards WHERE user_id = ? ORDER BY id DESC',
      [req.user.id]
    );

    res.json({ success: true, data: cards });
  } catch (error) {
    next(error);
  }
};

// Sensitive: Protected by PIN verification
exports.revealDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { pin } = req.body;

    if (!pin) {
      return res.status(403).json({ success: false, error: 'Transaction PIN required to unmask card credentials' });
    }

    // Verify PIN against user record
    const [users] = await db.query('SELECT transaction_pin FROM app_users WHERE id = ?', [req.user.id]);
    if (users.length === 0 || users[0].transaction_pin !== String(pin)) {
      return res.status(403).json({ success: false, error: 'Incorrect 4-digit Transaction PIN' });
    }

    const [cards] = await db.query(
      'SELECT * FROM virtual_cards WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (cards.length === 0) {
      return res.status(404).json({ success: false, error: 'Virtual card not found' });
    }

    const card = cards[0];
    res.json({
      success: true,
      message: 'Card credentials unmasked securely',
      data: {
        id: card.id,
        card_holder_name: card.card_holder_name,
        card_number: card.card_number,
        cvv: card.cvv,
        expiry: card.expiry,
        card_type: card.card_type,
        card_tier: card.card_tier,
        status: card.status,
        balance: card.balance
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.toggleFreeze = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [cards] = await db.query('SELECT status FROM virtual_cards WHERE id = ? AND user_id = ?', [id, req.user.id]);

    if (cards.length === 0) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }

    const newStatus = cards[0].status === 'frozen' ? 'active' : 'frozen';
    await db.query('UPDATE virtual_cards SET status = ? WHERE id = ?', [newStatus, id]);

    res.json({
      success: true,
      message: `Card is now ${newStatus.toUpperCase()}`,
      data: { status: newStatus }
    });
  } catch (error) {
    next(error);
  }
};

exports.requestCard = async (req, res, next) => {
  try {
    const { card_type, tier } = req.body;
    const holder = req.user.full_name.toUpperCase();
    const prefix = card_type === 'Mastercard' ? '54' : '45';
    const randDigits = Math.floor(10000000000000 + Math.random() * 90000000000000).toString();
    const fullNum = (prefix + randDigits).replace(/(\d{4})/g, '$1 ').trim();
    const cvv = Math.floor(100 + Math.random() * 900).toString();

    const [insert] = await db.query(
      `INSERT INTO virtual_cards (user_id, card_holder_name, card_number, cvv, expiry, card_type, card_tier, status, balance, spending_limit)
       VALUES (?, ?, ?, ?, '10/31', ?, ?, 'active', 1000.00, 5000.00)`,
      [req.user.id, holder, fullNum, cvv, card_type || 'Visa', tier || 'Gold Elite']
    );

    res.status(201).json({
      success: true,
      message: 'New institutional 3D virtual card issued successfully',
      data: { id: insert.insertId, card_type, tier }
    });
  } catch (error) {
    next(error);
  }
};
