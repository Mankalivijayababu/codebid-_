const jwt = require("jsonwebtoken");
const Team = require("../models/Team");
const Round = require("../models/Round");

module.exports = (io) => {

  /* ───────────────── AUTH MIDDLEWARE ───────────────── */

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) return next(new Error("No token provided"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      /* ADMIN AUTH */

      if (decoded.role === "admin" || decoded.role === "superadmin") {
        socket.user = {
          role: "admin",
          email: decoded.email,
        };
        return next();
      }

      /* TEAM AUTH */

      const team = await Team.findById(decoded.id);

      if (!team || !team.isActive)
        return next(new Error("Team not found or inactive"));

      socket.user = {
        role: "team",
        id: team._id.toString(),
        teamName: team.teamName,
      };

      next();

    } catch (err) {
      console.log("Socket auth error:", err.message);
      next(new Error("Invalid token"));
    }
  });

  /* ───────────────── SOCKET CONNECTION ───────────────── */

  io.on("connection", async (socket) => {
    try {

      const { user } = socket;

      console.log(`🔌 ${user.role} connected`);

      /* ───── JOIN ROOMS ───── */

      if (user.role === "admin") {
        socket.join("admin-room");
        console.log("🧠 Admin joined admin-room");
      }

      if (user.role === "team") {
        socket.join("teams-room");

        /* MULTI DEVICE PROTECTION */

        const existingTeam = await Team.findById(user.id);

        if (
          existingTeam?.currentSocketId &&
          existingTeam.currentSocketId !== socket.id
        ) {
          io.to(existingTeam.currentSocketId).emit("force:logout", {
            message: "Logged in from another device",
          });
        }

        await Team.findByIdAndUpdate(user.id, {
          currentSocketId: socket.id,
        });
      }

      /* ───── ONLINE TEAM COUNT ───── */

      const teamSockets = await io.in("teams-room").fetchSockets();

      io.to("admin-room").emit("teams:online", {
        count: teamSockets.length,
      });

      /* ───── ACTIVE ROUND RESTORE ───── */

      const activeRound = await Round.findOne({
        status: { $in: ["bidding", "reviewing"] },
      });

      if (activeRound) {
        socket.emit("round:restore", {
          roundNumber: activeRound.roundNumber,
          title: activeRound.title,
          category: activeRound.category,
          status: activeRound.status,
          bids: activeRound.bids,
          winnerName: activeRound.winnerName,
          winningBid: activeRound.winningBid,
        });
      }

      /* ───────────────── ADMIN SOCKET EVENTS ───────────────── */

      socket.on("admin:end-bidding", async () => {
        if (user.role !== "admin") return;

        try {
          const round = await Round.findOne({ status: "bidding" });
          if (!round) return;

          round.status = "reviewing";
          round.biddingEndedAt = new Date();

          const sorted = [...round.bids].sort((a, b) => {
            if (b.amount !== a.amount) return b.amount - a.amount;
            return new Date(a.timestamp) - new Date(b.timestamp);
          });

          if (sorted.length > 0) {
            round.winnerId = sorted[0].teamId;
            round.winnerName = sorted[0].teamName;
            round.winningBid = sorted[0].amount;
          }

          await round.save();

          io.emit("bidding:ended", {
            winner: sorted[0] || null,
          });

        } catch (err) {
          console.log("End bidding error:", err.message);
        }
      });

      socket.on("admin:result", async ({ result }) => {
        if (user.role !== "admin") return;

        try {
          const round = await Round.findOne({ status: "reviewing" });
          if (!round || !round.winnerId) return;

          const team = await Team.findById(round.winnerId);

          let reward =
            round.category === "Easy" ? 200 :
            round.category === "Medium" ? 400 : 600;

          if (result === "correct") {
            team.coins += reward;
          } else {
            team.coins = Math.max(0, team.coins - round.winningBid);
          }

          await team.save();

          round.result = result;
          round.status = "completed";
          round.completedAt = new Date();
          await round.save();

          const teams = await Team.find({ isActive: true }).sort({ coins: -1 });

          const leaderboard = teams.map((t, i) => ({
            rank: i + 1,
            teamName: t.teamName,
            coins: t.coins,
          }));

          io.emit("round:completed", {
            winner: round.winnerName,
            leaderboard,
          });

        } catch (err) {
          console.log("Result error:", err.message);
        }
      });

      /* ───────────────── HEARTBEAT ───────────────── */

      socket.on("ping", () => {
        socket.emit("pong", { ts: Date.now() });
      });

      /* ───────────────── DISCONNECT ───────────────── */

      socket.on("disconnect", async () => {
        try {
          console.log("❌ socket disconnected");

          if (user.role === "team") {
            await Team.findByIdAndUpdate(user.id, { currentSocketId: null });
          }

          const remainingTeams = await io.in("teams-room").fetchSockets();

          io.to("admin-room").emit("teams:online", {
            count: remainingTeams.length,
          });

        } catch (err) {
          console.log("Disconnect error:", err.message);
        }
      });

    } catch (err) {
      console.log("Socket connection failure:", err.message);
    }
  });
};
