const jwt = require("jsonwebtoken");
const Team = require("../models/Team");

// ── Protect team routes ──────────────────────────────────────
exports.protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }
    if (!token) return res.status(401).json({ success: false, message: "Not authenticated" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role === "admin") {
      req.user = { role: "admin", email: decoded.email, name: decoded.name };
      return next();
    }

    const team = await Team.findById(decoded.id);
    if (!team) return res.status(401).json({ success: false, message: "Team not found" });
    if (!team.isActive) return res.status(403).json({ success: false, message: "Team is disabled" });

    req.user = team;
    req.user.role = "team";
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

// ── Admin only middleware ────────────────────────────────────
exports.adminOnly = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }
  next();
};

// ── Validate admin Google email ──────────────────────────────
exports.isAuthorizedAdmin = (email) => {
  const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim().toLowerCase()) || [];
  return adminEmails.includes(email.toLowerCase());
};
