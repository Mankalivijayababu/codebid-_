const jwt = require("jsonwebtoken");
const Team = require("../models/Team");
const Round = require("../models/Round");

module.exports = (io) => {

  /* ───────── AUTH MIDDLEWARE ───────── */

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("No token"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (decoded.role === "admin" || decoded.role === "superadmin") {
        socket.user = { role: "admin", email: decoded.email };
        return next();
      }

      const team = await Team.findById(decoded.id);
      if (!team || !team.isActive)
        return next(new Error("Team inactive"));

      socket.user = {
        role: "team",
        id: team._id.toString(),
        teamName: team.teamName,
      };

      next();
    } catch (err) {
      next(new Error("Invalid token"));
    }
  });

  /* ───────── CONNECTION ───────── */

  io.on("connection", async (socket) => {

    const { user } = socket;

    if (user.role === "admin") socket.join("admin-room");
    if (user.role === "team") socket.join("teams-room");

    /* =====================================================
       ADMIN START QUESTION (LOCKED)
    ===================================================== */

    socket.on("admin:start-question", async ({ category, question }) => {
      if (user.role !== "admin") return;

      const existing = await Round.findOne({
        status: { $in: ["bidding", "reviewing"] },
      });

      if (existing) return; // prevent double round

      const newRound = await Round.create({
        category,
        title: question.question,
        options: question.options,
        status: "bidding",
        bids: [],
        createdAt: new Date(),
      });

      io.emit("projector:show-question", {
        question: question.question,
        options: question.options,
        category,
      });

      io.emit("bidding:start");
    });

    /* =====================================================
       TEAM PLACE BID (ANTI-SPAM)
    ===================================================== */

    socket.on("team:place-bid", async ({ amount }) => {
      if (user.role !== "team") return;

      const round = await Round.findOne({ status: "bidding" });
      if (!round) return;

      const existingBid = round.bids.find(
        (b) => b.teamId.toString() === user.id
      );

      if (existingBid) return; // only one bid allowed

      round.bids.push({
        teamId: user.id,
        teamName: user.teamName,
        amount,
        timestamp: new Date(),
      });

      await round.save();

      io.emit("bidding:update", round.bids);
    });

    /* =====================================================
       ADMIN END BIDDING
    ===================================================== */

    socket.on("admin:end-bidding", async () => {
      if (user.role !== "admin") return;

      const round = await Round.findOne({ status: "bidding" });
      if (!round) return;

      round.status = "reviewing";

      const sorted = [...round.bids].sort((a,b)=>{
        if (b.amount !== a.amount) return b.amount - a.amount;
        return new Date(a.timestamp) - new Date(b.timestamp);
      });

      if (sorted.length === 0) return;

      const winner = sorted[0];

      round.winnerId = winner.teamId;
      round.winnerName = winner.teamName;
      round.winningBid = winner.amount;
      await round.save();

      io.emit("projector:show-winner", winner);

      /* SERVER TIMER AUTHORITY */

      let timeLeft = 60;

      const timer = setInterval(()=>{
        timeLeft--;
        io.emit("projector:timer",{timeLeft});

        if(timeLeft<=0){
          clearInterval(timer);
          io.emit("projector:timeup");
          io.emit("admin:auto-wrong");
        }

      },1000);
    });

    /* =====================================================
       TEAM SUBMIT ANSWER (LOCKED)
    ===================================================== */

    socket.on("team:submit-answer", async ({ answer }) => {
      if (user.role !== "team") return;

      const round = await Round.findOne({ status: "reviewing" });
      if (!round) return;

      if (round.winnerId.toString() !== user.id) return;
      if (round.submittedAnswer) return; // prevent resubmit

      round.submittedAnswer = answer;
      await round.save();

      io.emit("projector:selected-answer", {
        teamName: user.teamName,
        answer,
      });

      io.to("admin-room").emit("admin:answer-received", {
        teamName: user.teamName,
        answer,
      });
    });

    /* =====================================================
       ADMIN RESULT
    ===================================================== */

    socket.on("admin:result", async ({ result }) => {
      if (user.role !== "admin") return;

      const round = await Round.findOne({ status: "reviewing" });
      if (!round) return;

      const team = await Team.findById(round.winnerId);

      let reward =
        round.category === "Easy" ? 100 :
        round.category === "Medium" ? 250 : 350;

      if(result==="correct"){
        team.coins += reward;
      } else {
        team.coins = Math.max(0, team.coins - round.winningBid);
      }

      /* ELIMINATION RULE */

      if(team.coins <= 0){
        team.coins = 0;
        team.isActive = false;
      }

      await team.save();

      io.emit("projector:result", { result });

      const teams = await Team.find({}).sort({coins:-1});

      io.emit("leaderboard:update", teams);
    });

    /* =====================================================
       AUTO WRONG (TIMEOUT)
    ===================================================== */

    socket.on("admin:auto-wrong", async () => {

      const round = await Round.findOne({ status:"reviewing" });
      if(!round) return;

      const team = await Team.findById(round.winnerId);

      team.coins = Math.max(0, team.coins - round.winningBid);

      if(team.coins <= 0){
        team.coins = 0;
        team.isActive = false;
      }

      await team.save();

      io.emit("projector:result",{result:"wrong"});
    });

    /* =====================================================
       ONLINE TEAM COUNT
    ===================================================== */

    const teamSockets = await io.in("teams-room").fetchSockets();
    io.to("admin-room").emit("teams:online", {
      count: teamSockets.length,
    });

  });
};