const express = require("express");
const Team = require("../models/Team");
const { protect, adminOnly } = require("../middleware/auth");

const router = express.Router();

// ── GET /api/teams ─ All teams (admin) ───────────────────────
router.get("/", protect, adminOnly, async (req, res) => {
  try {
    const teams = await Team.find().sort({ coins: -1 });
    res.json({ success: true, teams });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/teams/leaderboard ─ Public leaderboard ──────────
router.get("/leaderboard", protect, async (req, res) => {
  try {
    const teams = await Team.find({ isActive: true })
      .select("teamName repName coins correctAnswers wrongAnswers totalBids")
      .sort({ coins: -1 });

    const leaderboard = teams.map((t, i) => ({
      rank: i + 1,
      id: t._id,
      teamName: t.teamName,
      repName: t.repName,
      coins: t.coins,
      correctAnswers: t.correctAnswers,
      wrongAnswers: t.wrongAnswers,
      totalBids: t.totalBids,
      accuracy: t.totalBids > 0 ? Math.round((t.correctAnswers / t.totalBids) * 100) : 0,
    }));

    res.json({ success: true, leaderboard });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PATCH /api/teams/:id/disable ─ Admin disables a team ─────
router.patch("/:id/disable", protect, adminOnly, async (req, res) => {
  try {
    const team = await Team.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!team) return res.status(404).json({ success: false, message: "Team not found" });

    // Kick them out via socket
    req.app.get("io").emit("team:disabled", { teamId: team._id });

    res.json({ success: true, message: `${team.teamName} has been disabled` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PATCH /api/teams/:id/enable ──────────────────────────────
router.patch("/:id/enable", protect, adminOnly, async (req, res) => {
  try {
    const team = await Team.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
    if (!team) return res.status(404).json({ success: false, message: "Team not found" });
    res.json({ success: true, message: `${team.teamName} re-enabled` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/teams/reset ─ Admin resets all coins ───────────
router.post("/reset", protect, adminOnly, async (req, res) => {
  try {
    await Team.updateMany(
      {},
      { coins: 2000, correctAnswers: 0, wrongAnswers: 0, totalBids: 0, powerUsed: false }
    );

    const teams = await Team.find().sort({ teamName: 1 });

    // Notify all clients
    req.app.get("io").emit("game:reset", { message: "Game has been reset. All coins restored to 2000." });

    res.json({ success: true, message: "All team coins reset to 2000", teams });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PATCH /api/teams/:id/coins ─ Manually adjust coins ───────
router.patch("/:id/coins", protect, adminOnly, async (req, res) => {
  try {
    const { coins } = req.body;
    if (coins === undefined || coins < 0)
      return res.status(400).json({ success: false, message: "Valid coin amount required" });

    const team = await Team.findByIdAndUpdate(req.params.id, { coins }, { new: true });
    if (!team) return res.status(404).json({ success: false, message: "Team not found" });

    req.app.get("io").emit("coins:updated", { teamId: team._id, teamName: team.teamName, coins: team.coins });

    res.json({ success: true, team });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/teams/:id ─ Remove a team ────────────────────
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    const team = await Team.findByIdAndDelete(req.params.id);
    if (!team) return res.status(404).json({ success: false, message: "Team not found" });
    res.json({ success: true, message: `${team.teamName} removed` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

