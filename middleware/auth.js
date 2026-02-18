const jwt = require("jsonwebtoken");

// ─────────────────────────────────────────────
// Protect routes (requires valid JWT)
// ─────────────────────────────────────────────
const protect = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // No header
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    // Header must start with Bearer
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Invalid token format",
      });
    }

    // Extract token
    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Token missing",
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user to request
    req.user = decoded;

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Token invalid",
    });
  }
};

// ─────────────────────────────────────────────
// Admin-only middleware
// ─────────────────────────────────────────────
const adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  const adminOnly = (req, res, next) => {
  if (!["admin", "superadmin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};


  next();
};

// ─────────────────────────────────────────────
// Check authorized admin emails
// ─────────────────────────────────────────────
const isAuthorizedAdmin = (email) => {
  const admins = (process.env.ADMIN_EMAILS || "").split(",");
  return admins.includes(email);
};

module.exports = {
  protect,
  adminOnly,
  isAuthorizedAdmin,
};
