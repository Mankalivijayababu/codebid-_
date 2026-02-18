const jwt = require("jsonwebtoken");
const Team = require("../models/Team");
const Round = require("../models/Round");

module.exports = (io) => {

  /* ───────────────── AUTH MIDDLEWARE ───────────────── */
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("No token provided"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      /* ───── ADMIN SOCKET ───── */
      if (decoded.role === "admin") {
        socket.user = {
          role: "admin",
          email: decoded.email,
        };
        return next();
      }

      /* ───── TEAM SOCKET ───── */
      const team = await Team.findById(decoded.id);

      if (!team || !team.isActive) {
        return next(new Error("Team not found or inactive"));
      }

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

  /* ───────────────── CONNECTION ───────────────── */
  io.on("connection", async (socket) => {
    const { user } = socket;

    console.log(`🔌 Connected → ${user.role} (${user.teamName || user.email})`);

    /* ───── ADMIN JOIN ───── */
    if (user.role === "admin") {
      socket.join("admin-room");
    }

    /* ───── TEAM JOIN ───── */
    if (user.role === "team") {
      socket.join("teams-room");

      // duplicate login detection
      const existingTeam = await Team.findById(user.id);

      if (
        existingTeam?.currentSocketId &&
        existingTeam.currentSocketId !== socket.id
      ) {
        io.to(existingTeam.currentSocketId).emit("force:logout", {
          message: "Logged in from another device",
        });
      }

      // store socket id
      await Team.findByIdAndUpdate(user.id, {
        currentSocketId: socket.id,
      });
    }

    /* ───────────────── SEND CURRENT ROUND ON CONNECT ───────────────── */
    const activeRound = await Round.findOne({
      status: { $in: ["bidding", "reviewing"] },
    }).sort({ createdAt: -1 });

    if (activeRound) {
      socket.emit("round:restore", {
        roundNumber: activeRound.roundNumber,
        title: activeRound.title,
        category: activeRound.category,
        status: activeRound.status,
        bids: activeRound.bids,
      });
    }

    /* ───────────────── ONLINE TEAM COUNT ───────────────── */
    const teamSockets = await io.in("teams-room").fetchSockets();

    io.to("admin-room").emit("teams:online", {
      count: teamSockets.length,
    });

    /* ───────────────── LIVE BID BROADCAST ───────────────── */
    socket.on("bid:placed", (data) => {
      // admin sees instantly
      io.to("admin-room").emit("bid:received", data);
    });

    /* ───────────────── HEARTBEAT ───────────────── */
    socket.on("ping", () => {
      socket.emit("pong", { ts: Date.now() });
    });

    /* ───────────────── DISCONNECT ───────────────── */
    socket.on("disconnect", async () => {
      console.log(`❌ Disconnected → ${user.role}`);

      if (user.role === "team") {
        await Team.findByIdAndUpdate(user.id, {
          currentSocketId: null,
        });
      }

      // update online count again
      const remainingTeams = await io.in("teams-room").fetchSockets();

      io.to("admin-room").emit("teams:online", {
        count: remainingTeams.length,
      });
    });
  });
};
