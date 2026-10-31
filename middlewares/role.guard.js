function requireRole(requiredRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (req.user.role !== requiredRole && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access forbidden: Insufficient administrative privileges' });
    }

    next();
  };
}

module.exports = {
  requireRole,
  requireAdmin: requireRole('admin')
};
