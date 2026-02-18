const mongoose = require("mongoose");

const gameSchema = new mongoose.Schema({
  isActive: { type: Boolean, default: false },
  currentRound: { type: Number, default: 0 },
  currentQuestion: { type: String, default: null },
  biddingOpen: { type: Boolean, default: false },
  lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Game", gameSchema);
