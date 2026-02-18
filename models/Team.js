const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const teamSchema = new mongoose.Schema(
  {
    teamName: {
      type: String,
      required: [true, "Team name is required"],
      unique: true,
      trim: true,
    },

    repName: {
      type: String,
      required: [true, "Representative name is required"],
      trim: true,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false,
    },

    // 💰 GAME ECONOMY
    coins: {
      type: Number,
      default: 2000,
    },

    totalBids: {
      type: Number,
      default: 0,
    },

    correctAnswers: {
      type: Number,
      default: 0,
    },

    wrongAnswers: {
      type: Number,
      default: 0,
    },

    // 🔥 ANTI-SPAM FIELD
    lastBidTime: {
      type: Number,
      default: 0,
    },

    // 🎮 POWER SYSTEM
    powerUsed: {
      type: Boolean,
      default: false,
    },

    // 🟢 ACTIVE STATUS
    isActive: {
      type: Boolean,
      default: true,
    },

    // 📡 SOCKET TRACKING
    currentSocketId: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// ───────────────── PASSWORD HASH ─────────────────
teamSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ───────────────── PASSWORD CHECK ─────────────────
teamSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// ───────────────── REMOVE SENSITIVE DATA ─────────────────
teamSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.currentSocketId;
  return obj;
};

// ───────────────── INDEXING (IMPORTANT FOR 30+ TEAMS) ─────────────────

// leaderboard sorting
teamSchema.index({ coins: -1 });

// socket tracking
teamSchema.index({ currentSocketId: 1 });

// active team queries
teamSchema.index({ isActive: 1 });

// email login
teamSchema.index({ email: 1 });

// ───────────────── EXPORT ─────────────────
module.exports = mongoose.model("Team", teamSchema);
