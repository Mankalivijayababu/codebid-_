require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const connectDB = require("./config/db");

/* ── ROUTES ───────────────────────────────────── */
const authRoutes = require("./routes/auth");
const adminAuthRoutes = require("./routes/adminAuth");
const gameRoutes = require("./routes/game");
const teamRoutes = require("./routes/teams");

/* ── SOCKET EVENTS ────────────────────────────── */
const registerSocketEvents = require("./socket/gameEvents");

/* ── MODELS ───────────────────────────────────── */
const Round = require("./models/Round");

/* ── INIT ─────────────────────────────────────── */
const app = express();
const server = http.createServer(app);

/* ============================================================
   🗄️ DATABASE CONNECTION
============================================================ */
connectDB();

/* ============================================================
   🌐 GLOBAL CORS CONFIG (Hackathon Safe)
============================================================ */

app.use(cors({
  origin: true,
  credentials: true
}));

app.options("*", cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* KEEP ALIVE FOR RENDER */
app.get("/keepalive", (req, res) => res.send("alive"));

/* ============================================================
   📡 SOCKET.IO ENGINE
============================================================ */

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket"],
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.set("io", io);

/* ============================================================
   🛡️ ROUND RECOVERY ENGINE
   Restores projector state if server restarts mid-round
============================================================ */

async function recoverActiveRound(io) {
  try {
    const round = await Round.findOne({
      status: { $in: ["bidding", "reviewing"] },
    });

    if (!round) return;

    console.log("🛡️ Active round restored after restart");

    /* SHOW QUESTION AGAIN ON PROJECTOR */
    io.emit("projector:show-question", {
      question: round.title,
      options: round.options || [],
      category: round.category,
    });

    /* IF BIDDING PHASE */
    if (round.status === "bidding") {
      io.emit("bidding:start");
    }

    /* IF ANSWERING PHASE */
    if (round.status === "reviewing") {
      io.emit("projector:show-winner", {
        teamName: round.winnerName,
        bidAmount: round.winningBid,
      });
    }

  } catch (err) {
    console.log("Recovery failed:", err.message);
  }
}

/* ============================================================
   🔌 REGISTER SOCKET EVENTS
============================================================ */

registerSocketEvents(io);

/* ============================================================
   📦 REST ROUTES
   Used for login, data fetch, fallback sync
============================================================ */

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminAuthRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/teams", teamRoutes);

/* ============================================================
   HEALTH CHECK
============================================================ */

app.get("/", (req, res) => {
  res.json({
    message: "⚡ CODEBID SERVER RUNNING",
    mode: "Realtime Event Engine",
    status: "OK",
  });
});

/* ============================================================
   404 HANDLER
============================================================ */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

/* ============================================================
   GLOBAL ERROR HANDLER
============================================================ */

app.use((err, req, res, next) => {
  console.error("💥 Server Error:", err.message);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

/* ============================================================
   CRASH PROTECTION
============================================================ */

process.on("uncaughtException", (err) => {
  console.error("🔥 Uncaught Exception:", err.message);
});

process.on("unhandledRejection", (err) => {
  console.error("🔥 Unhandled Promise:", err.message);
});

/* ============================================================
   🚀 START SERVER
============================================================ */

const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {

  await recoverActiveRound(io);

  console.log(`
⚡ =========================================
        CODEBID FEST SERVER LIVE
⚡ =========================================
🚀 Port        : ${PORT}
📡 Socket.io   : Realtime active
🗄️  Database   : Connected
🛡️ Recovery    : Enabled
🌐 CORS        : Hackathon Safe
============================================
  `);
});