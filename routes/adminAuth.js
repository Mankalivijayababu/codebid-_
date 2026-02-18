const express = require("express");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const { adminProtect, superAdminOnly } = require("../middleware/adminProtect");

const router = express.Router();

// 🔐 ADMIN LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email }).select("+password");

    if (!admin)
      return res.status(401).json({ message: "Invalid credentials" });

    const isMatch = await admin.comparePassword(password);

    if (!isMatch)
      return res.status(401).json({ message: "Invalid credentials" });

    admin.lastLogin = new Date();
    await admin.save();

    const token = jwt.sign(
      {
        id: admin._id,
        role: admin.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({
      success: true,
      token,
      admin: {
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// 🛠 CREATE ADMIN (SUPERADMIN ONLY)
router.post("/create", adminProtect, superAdminOnly, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const exists = await Admin.findOne({ email });
    if (exists)
      return res.status(400).json({ message: "Admin already exists" });

    const admin = await Admin.create({
      name,
      email,
      password,
      role: "admin",
    });

    res.json({
      success: true,
      message: "Admin created successfully",
      admin,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// 📋 GET ADMINS LIST
router.get("/all", adminProtect, superAdminOnly, async (req, res) => {
  const admins = await Admin.find().sort({ createdAt: -1 });
  res.json({ admins });
});


// ❌ DEACTIVATE ADMIN
router.patch("/deactivate/:id", adminProtect, superAdminOnly, async (req, res) => {
  await Admin.findByIdAndUpdate(req.params.id, { isActive: false });
  res.json({ success: true });
});

module.exports = router;
