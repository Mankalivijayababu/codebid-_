const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const Team = require("../models/Team");
const { isAuthorizedAdmin } = require("../middleware/auth");

const router = express.Router();


// ─────────────────────────────────────────────
// SIGNUP
// ─────────────────────────────────────────────
router.post("/signup", async (req, res) => {
  try {
    const { teamName, repName, email, password } = req.body;

    if (!teamName || !repName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields required",
      });
    }

    const existing = await Team.findOne({ email });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    // ⚠️ DO NOT hash here
    // Team model pre-save hook will hash automatically
    const team = await Team.create({
      teamName,
      repName,
      email,
      password, // plain password → auto hashed by Team.js
      coins: 2000,
      correctAnswers: 0,
      wrongAnswers: 0,
      totalBids: 0,
      powerUsed: false,
      isActive: true,
    });

    res.json({
      success: true,
      message: "Signup successful",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});


// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // ⚠️ Fetch password explicitly (select:false in schema)
    const user = await Team.findOne({ email }).select("+password");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Compare password using bcrypt
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Auto detect admin role
    const role = isAuthorizedAdmin(user.email) ? "admin" : "team";

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user._id,
        role,
        email: user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "12h",
      }
    );

    res.json({
      success: true,
      token,
      role,
      user: {
        id: user._id,
        teamName: user.teamName,
        email: user.email,
        coins: user.coins,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
});


// ─────────────────────────────────────────────
// AUTH TEST ROUTE
// ─────────────────────────────────────────────
router.get("/me", (req, res) => {
  res.json({
    success: true,
    message: "Auth route working",
  });
});

module.exports = router;
