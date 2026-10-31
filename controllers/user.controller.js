const db = require('../config/db');

exports.getProfile = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      'SELECT id, account_id, full_name, username, email, role, kyc_status, email_verified, phone, country, address, avatar_url, created_at FROM app_users WHERE id = ?',
      [req.user.id]
    );

    if (rows.length === 0) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { full_name, phone, country, address } = req.body;
    await db.query(
      'UPDATE app_users SET full_name = ?, phone = ?, country = ?, address = ? WHERE id = ?',
      [full_name || req.user.full_name, phone || null, country || null, address || null, req.user.id]
    );

    res.json({ success: true, message: 'Profile successfully updated' });
  } catch (error) {
    next(error);
  }
};

exports.submitKYC = async (req, res, next) => {
  try {
    const { document_type, front_image, back_image } = req.body;

    if (!front_image) {
      return res.status(400).json({ success: false, error: 'Front image of government-issued ID is required' });
    }

    // Insert KYC Document
    await db.query(
      `INSERT INTO kyc_documents (user_id, document_type, front_image, back_image, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [req.user.id, document_type || 'National Passport / ID', front_image, back_image || '']
    );

    // Update user status to pending
    await db.query("UPDATE app_users SET kyc_status = 'pending' WHERE id = ?", [req.user.id]);

    res.status(201).json({
      success: true,
      message: 'KYC identity documents submitted successfully. Verification status: Pending Review.',
      data: { kyc_status: 'pending' }
    });
  } catch (error) {
    next(error);
  }
};

exports.getKYCStatus = async (req, res, next) => {
  try {
    const [docs] = await db.query(
      'SELECT * FROM kyc_documents WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        kyc_status: req.user.kyc_status,
        latest_submission: docs[0] || null
      }
    });
  } catch (error) {
    next(error);
  }
};
