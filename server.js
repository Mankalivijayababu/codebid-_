require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const connectDB = require("./config/db");

// ── Routes ─────────────────────────────────────
const authRoutes = require("./routes/auth");
const adminAuthRoutes = require("./routes/adminAuth");
const gameRoutes = require("./routes/game");
const teamRoutes = require("./routes/teams");

// ── Socket events ──────────────────────────────
const registerSocketEvents = require("./socket/gameEvents");

// ── Models ─────────────────────────────────────
const Round = require("./models/Round");

// ── Init ───────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ── CONNECT DATABASE ───────────────────────────
connectDB();

/* ───────────────────────────────────────────────
   🌐 CORS CONFIG (PRODUCTION SAFE)
   Allows:
   - localhost
   - vercel deployments (preview + prod)
   - render apps
─────────────────────────────────────────────── */

app.use(
  cors({
    origin: function (origin, callback) {

      if (!origin) return callback(null, true);

      if (
        origin.includes("localhost") ||
        origin.includes("127.0.0.1") ||
        origin.includes("vercel.app") ||
        origin.includes("onrender.com")
      ) {
        return callback(null, true);
      }

      return callback(new Error("CORS blocked: " + origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  })
);

app.options("*", cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/keepalive", (req, res) => res.send("alive"));

/* ───────────────────────────────────────────────
   📡 SOCKET.IO SETUP (PRODUCTION SAFE)
─────────────────────────────────────────────── */

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (
        origin.includes("localhost") ||
        origin.includes("127.0.0.1") ||
        origin.includes("vercel.app") ||
        origin.includes("onrender.com")
      ) {
        return callback(null, true);
      }

      callback(new Error("Socket CORS blocked"));
    },
    methods: ["GET", "POST"],
    credentials: true,
  },

  transports: ["websocket"],
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.set("io", io);

/* ───────────────────────────────────────────────
   🛡️ ROUND RECOVERY ENGINE
─────────────────────────────────────────────── */

async function recoverActiveRound(io) {
  try {
    const round = await Round.findOne({
      status: { $in: ["bidding", "reviewing"] },
    });

    if (!round) return;

    console.log("🛡️ Active round restored");

    io.emit("round:started", {
      roundNumber: round.roundNumber,
      title: round.title,
      category: round.category,
      status: round.status,
      duration: 30,
    });

  } catch (err) {
    console.log("Recovery failed:", err.message);
  }
}

/* ───────────────────────────────────────────────
   SOCKET EVENTS
─────────────────────────────────────────────── */

registerSocketEvents(io);

/* ───────────────────────────────────────────────
   ROUTES
─────────────────────────────────────────────── */

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminAuthRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/teams", teamRoutes);

/* ───────────────────────────────────────────────
   HEALTH CHECK
─────────────────────────────────────────────── */

app.get("/", (req, res) => {
  res.json({
    message: "⚡ CODEBID SERVER RUNNING",
    status: "OK",
  });
});

/* ───────────────────────────────────────────────
   404 HANDLER
─────────────────────────────────────────────── */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

/* ───────────────────────────────────────────────
   GLOBAL ERROR HANDLER
─────────────────────────────────────────────── */

app.use((err, req, res, next) => {
  console.error("💥 Error:", err.message);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

/* ───────────────────────────────────────────────
   CRASH PROTECTION
─────────────────────────────────────────────── */

process.on("uncaughtException", (err) => {
  console.error("🔥 Uncaught Exception:", err.message);
});

process.on("unhandledRejection", (err) => {
  console.error("🔥 Unhandled Promise:", err.message);
});

/* ───────────────────────────────────────────────
   START SERVER
─────────────────────────────────────────────── */

const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  await recoverActiveRound(io);

  console.log(`
⚡ =====================================
        CODEBID FEST SERVER LIVE
⚡ =====================================
🚀 Port        : ${PORT}
📡 Socket.io   : Realtime active
🗄️  Database   : Connected
========================================
  `);
});
