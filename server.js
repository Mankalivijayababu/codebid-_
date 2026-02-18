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

// ── Init ───────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ── CONNECT DATABASE FIRST ─────────────────────
connectDB();

// ───────────────────────────────────────────────
// 🌐 CORS CONFIG (FEST SAFE MODE)
// Supports:
// localhost
// college wifi IP
// production domain
const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.CLIENT_URLS
].filter(Boolean);

// ───────────────────────────────────────────────
// 📡 SOCKET.IO SETUP
// ───────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// make io available in routes
app.set("io", io);

// ───────────────────────────────────────────────
// 🔧 MIDDLEWARE
// ───────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Fix accidental "/api/api"
app.use((req, _res, next) => {
  if (req.url.startsWith("/api/api/")) {
    req.url = req.url.replace(/^\/api\/api\//, "/api/");
  }
  next();
});

// ───────────────────────────────────────────────
// 🔌 SOCKET EVENTS
// ───────────────────────────────────────────────
registerSocketEvents(io);

// ───────────────────────────────────────────────
// 🧭 API ROUTES
// ───────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminAuthRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/teams", teamRoutes);

// ───────────────────────────────────────────────
// ❤️ HEALTH CHECK
// ───────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    message: "⚡ CODEBID Server Running",
    status: "OK",
    timestamp: new Date().toISOString(),
  });
});

// ───────────────────────────────────────────────
// 404 HANDLER
// ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// ───────────────────────────────────────────────
// GLOBAL ERROR HANDLER
// ───────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("💥 Error:", err.message);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

// ───────────────────────────────────────────────
// 🛡️ SERVER CRASH PROTECTION
// ───────────────────────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("🔥 Uncaught Exception:", err.message);
});

process.on("unhandledRejection", (err) => {
  console.error("🔥 Unhandled Promise Rejection:", err.message);
});

// ───────────────────────────────────────────────
// 🚀 START SERVER
// ───────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`
⚡ =====================================
        CODEBID FEST SERVER LIVE
⚡ =====================================
🚀 Port        : ${PORT}
🌍 Local       : http://localhost:${PORT}
🌐 LAN         : http://10.0.57.166:${PORT}
🗄️  Database   : MongoDB Atlas Connected
📡 Socket.io   : Realtime active
🛡️  Mode       : FEST SAFE MODE
========================================
  `);
});
