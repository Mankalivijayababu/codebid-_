const express = require("express");
const Round = require("../models/Round");
const Team = require("../models/Team");
const { protect, adminOnly } = require("../middleware/auth");

const router = express.Router();

/* ─────────────────────────────────────────────
   HELPER — GET ACTIVE ROUND
───────────────────────────────────────────── */
const getActiveRound = async () => {
  return await Round.findOne({
    status: { $in: ["bidding", "reviewing"] },
  });
};

/* ─────────────────────────────────────────────
   GAME STATE (TEAM + ADMIN)
───────────────────────────────────────────── */
router.get("/state", protect, async (req, res) => {
  try {
    const round = await Round.findOne({
      status: { $in: ["bidding", "reviewing"] },
    }).sort({ createdAt: -1 });

    let teamData = null;

    if (req.user.role === "team") {
      const team = await Team.findById(req.user.id);

      if (team) {
        teamData = {
          teamName: team.teamName,
          coins: team.coins,
          correctAnswers: team.correctAnswers,
          wrongAnswers: team.wrongAnswers,
        };
      }
    }

    const allTeams = await Team.find({ isActive: true }).sort({ coins: -1 });

    const leaderboard = allTeams.map((t, i) => ({
      rank: i + 1,
      teamName: t.teamName,
      coins: t.coins,
    }));

    res.json({
      success: true,
      round,
      leaderboard,
      team: teamData,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ─────────────────────────────────────────────
   START ROUND (ADMIN) — SERVER TIMER ENGINE
───────────────────────────────────────────── */
router.post("/start", protect, adminOnly, async (req, res) => {
  try {
    const { title, category } = req.body;

    if (!title)
      return res
        .status(400)
        .json({ success: false, message: "Question title required" });

    const active = await getActiveRound();
    if (active)
      return res
        .status(400)
        .json({ success: false, message: "A round already active" });

    const lastRound = await Round.findOne().sort({ roundNumber: -1 });
    const roundNumber = lastRound ? lastRound.roundNumber + 1 : 1;

    const ROUND_DURATION = 30;

    const round = await Round.create({
      roundNumber,
      title,
      category: category || "Medium",
      status: "bidding",
      biddingStartedAt: new Date(),
      bids: [],
    });

    const io = req.app.get("io");

    /* SOCKET ROUND START */
    io.emit("round:started", {
      roundNumber: round.roundNumber,
      title: round.title,
      category: round.category,
      status: "bidding",
      duration: ROUND_DURATION,
    });

    /* SERVER TIMER LOOP */
    let timeLeft = ROUND_DURATION;

    const timerInterval = setInterval(async () => {
      timeLeft--;

      io.emit("timer:update", { timeLeft });

      if (timeLeft <= 0) {
        clearInterval(timerInterval);

        const activeRound = await Round.findById(round._id);

        if (activeRound && activeRound.status === "bidding") {
          activeRound.status = "reviewing";
          activeRound.biddingEndedAt = new Date();
          await activeRound.save();

          io.emit("bidding:ended");
        }
      }
    }, 1000);

    res.json({ success: true, round });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ─────────────────────────────────────────────
   PLACE BID (TEAM)
───────────────────────────────────────────── */
router.post("/bid", protect, async (req, res) => {
  try {
    if (req.user.role === "admin")
      return res
        .status(403)
        .json({ success: false, message: "Admins cannot bid" });

    const bidAmount = parseInt(req.body.amount);
    if (!bidAmount || bidAmount <= 0)
      return res
        .status(400)
        .json({ success: false, message: "Invalid bid amount" });

    const team = await Team.findById(req.user.id);
    if (!team)
      return res
        .status(404)
        .json({ success: false, message: "Team not found" });

    if (bidAmount > team.coins)
      return res
        .status(400)
        .json({ success: false, message: "Not enough coins" });

    /* ANTI SPAM */
    const now = Date.now();
    if (team.lastBidTime && now - team.lastBidTime < 1500) {
      return res.status(429).json({
        success: false,
        message: "Too fast! Wait before bidding again.",
      });
    }

    const round = await getActiveRound();
    if (!round || round.status !== "bidding")
      return res
        .status(400)
        .json({ success: false, message: "No active bidding round" });

    /* ATOMIC INSERT */
    const result = await Round.updateOne(
      {
        _id: round._id,
        status: "bidding",
        "bids.teamId": { $ne: team._id },
      },
      {
        $push: {
          bids: {
            teamId: team._id,
            teamName: team.teamName,
            amount: bidAmount,
            timestamp: new Date(),
          },
        },
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({
        success: false,
        message: "Bid rejected (duplicate or round closed)",
      });
    }

    team.lastBidTime = now;
    await team.save();

    /* SOCKET LIVE BID */
    req.app.get("io").emit("bid:received", {
      teamName: team.teamName,
      amount: bidAmount,
      timestamp: new Date(),
    });

    res.json({ success: true, message: "Bid placed successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ─────────────────────────────────────────────
   FORCE RESET ROUND (ADMIN)
───────────────────────────────────────────── */
router.patch("/force-reset", protect, adminOnly, async (req, res) => {
  try {
    const round = await getActiveRound();

    if (!round)
      return res.json({ success: true, message: "No active round to reset" });

    round.status = "completed";
    round.completedAt = new Date();
    await round.save();

    req.app.get("io").emit("round:force-reset");

    res.json({
      success: true,
      message: "Active round forcefully closed",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ─────────────────────────────────────────────
   END BIDDING (ADMIN)
───────────────────────────────────────────── */
router.post("/end-bidding", protect, adminOnly, async (req, res) => {
  try {
    const round = await getActiveRound();

    if (!round || round.status !== "bidding")
      return res
        .status(400)
        .json({ success: false, message: "No active bidding round" });

    round.status = "reviewing";
    round.biddingEndedAt = new Date();

    let winner = null;

    if (round.bids.length > 0) {
      const sorted = [...round.bids].sort((a, b) => {
        if (b.amount !== a.amount) return b.amount - a.amount;
        return new Date(a.timestamp) - new Date(b.timestamp);
      });

      winner = sorted[0];
      round.winnerId = winner.teamId;
      round.winnerName = winner.teamName;
      round.winningBid = winner.amount;
    }

    await round.save();

    req.app.get("io").emit("bidding:ended", { winner });

    res.json({ success: true, winner, round });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ─────────────────────────────────────────────
   RESULT (ADMIN)
───────────────────────────────────────────── */
router.post("/result", protect, adminOnly, async (req, res) => {
  try {
    const { result } = req.body;

    const round = await Round.findOne({ status: "reviewing" });

    if (!round || !round.winnerId)
      return res
        .status(400)
        .json({ success: false, message: "No winner to evaluate" });

    const team = await Team.findById(round.winnerId);

    let coinsChange = round.winningBid;

    if (result === "correct") {
      team.coins += coinsChange;
      team.correctAnswers += 1;
    } else {
      team.coins = Math.max(0, team.coins - coinsChange);
      team.wrongAnswers += 1;
    }

    team.totalBids += 1;
    await team.save();

    round.result = result;
    round.status = "completed";
    round.completedAt = new Date();
    await round.save();

    const allTeams = await Team.find({ isActive: true }).sort({ coins: -1 });

    const leaderboard = allTeams.map((t, i) => ({
      rank: i + 1,
      teamName: t.teamName,
      coins: t.coins,
      correctAnswers: t.correctAnswers,
      wrongAnswers: t.wrongAnswers,
    }));

    req.app.get("io").emit("round:completed", {
      result,
      winner: team.teamName,
      leaderboard,
    });

    res.json({ success: true, leaderboard });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
