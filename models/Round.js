const mongoose = require("mongoose");

// ───────────────── BID SCHEMA ─────────────────
const bidSchema = new mongoose.Schema({
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Team",
    required: true,
  },
  teamName: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 1,
  },
  timestamp: {
    type: Date,
    default: Date.now, // server timestamp
  },
});

// ───────────────── ROUND SCHEMA ─────────────────
const roundSchema = new mongoose.Schema(
  {
    roundNumber: {
      type: Number,
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      enum: ["Easy", "Medium", "Hard"],
      default: "Medium",
    },

    status: {
      type: String,
      enum: ["idle", "bidding", "reviewing", "completed"],
      default: "idle",
    },

    // All bids
    bids: [bidSchema],

    // Sorted bids for fairness + steal chance
    sortedBids: [
      {
        teamId: mongoose.Schema.Types.ObjectId,
        amount: Number,
        timestamp: Date,
      },
    ],

    // Winner info
    winnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null,
    },

    winnerName: {
      type: String,
      default: null,
    },

    winningBid: {
      type: Number,
      default: null,
    },

    result: {
      type: String,
      enum: ["correct", "wrong", null],
      default: null,
    },

    coinsAwarded: {
      type: Number,
      default: 0,
    },

    // TIMER CONTROL
    bidDuration: {
      type: Number,
      default: 30, // seconds
    },

    biddingStartedAt: {
      type: Date,
      default: null,
    },

    biddingEndedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    // Power-ups
    powerUpUsedBy: {
      teamId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team",
        default: null,
      },
      type: {
        type: String,
        enum: ["double", "steal", null],
        default: null,
      },
    },
  },
  { timestamps: true }
);

// ───────────────── INDEXING (VERY IMPORTANT FOR 30+ TEAMS) ─────────────────

// find active round fast
roundSchema.index({ status: 1 });

// search bids by team
roundSchema.index({ "bids.teamId": 1 });

// timer lookup
roundSchema.index({ biddingStartedAt: 1 });

// leaderboard & round sorting
roundSchema.index({ roundNumber: -1 });

// ───────────────── EXPORT ─────────────────
module.exports = mongoose.model("Round", roundSchema);
