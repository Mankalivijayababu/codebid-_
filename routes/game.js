const express = require("express");
const Round = require("../models/Round");
const Team = require("../models/Team");
const { protect, adminOnly } = require("../middleware/auth");

const router = express.Router();

/* ================= HELPER ================= */
const getActiveRound = async () => {
  return await Round.findOne({
    status: { $in: ["bidding", "reviewing"] },
  });
};

/* ================= GAME STATE ================= */
router.get("/state", protect, async (req, res) => {
  try {
    const round = await getActiveRound();

    // Leaderboard
    const teams = await Team.find({ isActive: true }).sort({ coins: -1 });

    const leaderboard = teams.map((t, i) => ({
      rank: i + 1,
      teamName: t.teamName,
      coins: t.coins,
      correctAnswers: t.correctAnswers,
      wrongAnswers: t.wrongAnswers,
    }));

    // Send logged-in team info
    let team = null;

    if (req.user.role === "team") {
      team = await Team.findById(req.user.id)
        .select("teamName coins correctAnswers wrongAnswers totalBids");
    }

    res.json({
      success: true,
      round,
      leaderboard,
      team,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ================= START ROUND ================= */
router.post("/start", protect, adminOnly, async (req, res) => {
  try {
    const { title, category } = req.body;

    if (!title)
      return res.status(400).json({
        success: false,
        message: "Question title required",
      });

    const active = await getActiveRound();
    if (active)
      return res.status(400).json({
        success: false,
        message: "A round already active",
      });

    const lastRound = await Round.findOne().sort({ roundNumber: -1 });
    const roundNumber = lastRound ? lastRound.roundNumber + 1 : 1;

    const round = await Round.create({
      roundNumber,
      title,
      category,
      status: "bidding",
      bids: [],
    });

    req.app.get("io").emit("round:started", round);

    res.json({ success: true, round });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ================= PLACE BID ================= */
router.post("/bid", protect, async (req, res) => {
  try {
    if (req.user.role === "admin")
      return res.status(403).json({ success: false });

    const amount = parseInt(req.body.amount);

    const team = await Team.findById(req.user.id);
    if (!team)
      return res.status(404).json({ success: false });

    if (amount > team.coins)
      return res.status(400).json({
        success: false,
        message: "Not enough coins",
      });

    const round = await getActiveRound();
    if (!round || round.status !== "bidding")
      return res.status(400).json({
        success: false,
        message: "No active bidding",
      });

    round.bids.push({
      teamId: team._id,
      teamName: team.teamName,
      amount,
      timestamp: new Date(),
    });

    await round.save();

    req.app.get("io").emit("bid:received", {
      teamName: team.teamName,
      amount,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* ================= END BIDDING ================= */
router.post("/end-bidding", protect, adminOnly, async (req, res) => {
  try {
    const round = await getActiveRound();

    if (!round || round.status !== "bidding")
      return res.status(400).json({
        success: false,
        message: "No active bidding round",
      });

    if (round.bids.length === 0) {
      round.status = "completed";
      await round.save();
      return res.json({ success: true, message: "No bids placed" });
    }

    const sorted = [...round.bids].sort((a, b) => {
      if (b.amount !== a.amount) return b.amount - a.amount;
      return new Date(a.timestamp) - new Date(b.timestamp);
    });

    const winner = sorted[0];

    round.winnerId = winner.teamId;
    round.winnerName = winner.teamName;
    round.status = "reviewing";

    await round.save();

    req.app.get("io").emit("bidding:ended", { winner });

    res.json({ success: true, winner });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* ================= RESULT ================= */
router.post("/result", protect, adminOnly, async (req, res) => {
  try {
    const { result } = req.body;

    const round = await Round.findOne({ status: "reviewing" });

    if (!round || !round.winnerId)
      return res.status(400).json({
        success: false,
        message: "No winner to evaluate",
      });

    const team = await Team.findById(round.winnerId);

    const rewardMap = {
      Easy: { correct: 100, wrong: 150 },
      Medium: { correct: 200, wrong: 250 },
      Hard: { correct: 400, wrong: 350 },
    };

    const reward = rewardMap[round.category];

    if (result === "correct") {
      team.coins += reward.correct;
      team.correctAnswers += 1;
    } else {
      team.coins = Math.max(0, team.coins - reward.wrong);
      team.wrongAnswers += 1;
    }

    await team.save();

    round.status = "completed";
    round.result = result;
    await round.save();

    // 🔥 FINAL FIXED EMIT
    req.app.get("io").emit("round:completed", {
      teamName: team.teamName,
      result: result,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* ================= FORCE RESET ================= */
router.patch("/force-reset", protect, adminOnly, async (req, res) => {
  try {
    const round = await getActiveRound();
    if (!round)
      return res.json({ success: true });

    round.status = "completed";
    await round.save();

    req.app.get("io").emit("round:force-reset");

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;
