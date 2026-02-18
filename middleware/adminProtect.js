const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

exports.adminProtect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token)
      return res.status(401).json({ message: "Not authorized" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const admin = await Admin.findById(decoded.id).select("+password");

    if (!admin || !admin.isActive)
      return res.status(401).json({ message: "Admin inactive" });

    req.admin = admin;
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid admin token" });
  }
};

exports.superAdminOnly = (req, res, next) => {
  if (req.admin.role !== "superadmin")
    return res.status(403).json({ message: "Super admin access only" });

  next();
};
