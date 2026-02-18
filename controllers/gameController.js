const Round = require("../models/Round");

/**
 * START NEW ROUND
 */
exports.startRound = async (req, res) => {
  try {
    const { title, category } = req.body;

    // check if any round active
    const activeRound = await Round.findOne({
      status: { $in: ["bidding", "reviewing"] }
    });

    if (activeRound) {
      return res.status(400).json({
        success: false,
        message: "A round already active"
      });
    }

    const newRound = new Round({
      title,
      category,
      status: "bidding",
      biddingStartedAt: new Date()
    });

    await newRound.save();

    res.json({
      success: true,
      message: "Round started successfully",
      round: newRound
    });

  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * COMPLETE ROUND (MOST IMPORTANT NOW)
 */
exports.completeRound = async (req, res) => {
  try {
    const round = await Round.findOne({
      status: "reviewing"
    });

    if (!round) {
      return res.status(400).json({
        success: false,
        message: "No reviewing round found"
      });
    }

    round.status = "completed";
    round.completedAt = new Date();

    await round.save();

    res.json({
      success: true,
      message: "Round completed successfully"
    });

  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * GET CURRENT GAME STATE
 */
exports.getGameState = async (req, res) => {
  try {
    const round = await Round.findOne().sort({ createdAt: -1 });

    res.json({
      success: true,
      round
    });

  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};
