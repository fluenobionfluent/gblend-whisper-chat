// backend/server.js
require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const mongoose = require("mongoose");
const path     = require("path");
const Message  = require("./models/Message");

const { MONGODB_URI, PORT } = process.env;

async function start() {
  // 1) Connect to MongoDB
  console.log("⚡️ Connecting to MongoDB at", MONGODB_URI);
  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser:    true,
    useUnifiedTopology: true
  });
  console.log("✅ MongoDB connected");

  // 2) Create Express app
  const app = express();
  app.use(cors());
  app.use(express.json());

  // 3) GET last N messages (for chat)
  app.get("/api/messages", async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 100);
    try {
      const msgs = await Message.find({})
                                .sort({ timestamp: -1 })
                                .limit(limit)
                                .lean();
      return res.json(msgs);
    } catch (err) {
      console.error("❌ GET /api/messages error:", err);
      return res.status(500).json({ error: "Could not load messages" });
    }
  });

  // 4) POST new message (ingest from on-chain event)
  app.post("/api/messages", async (req, res) => {
    const { id, author, text, timestamp } = req.body;
    const doc = { id, author: author.toLowerCase(), text, timestamp };

    console.log("👉 POST /api/messages:", doc);
    try {
      await Message.create(doc);
      return res.status(201).json({ success: true });
    } catch (e) {
      if (e.code === 11000) {
        // duplicate id is OK
        console.warn("⚠️ Duplicate message id, skipping:", doc.id);
        return res.status(200).json({ success: true, duplicate: true });
      }
      console.error("❌ DB insert error:", e);
      return res.status(500).json({ error: "DB error" });
    }
  });

  // 5) GET profile count for an address
  app.get("/api/profile/:addr", async (req, res) => {
    const addr = req.params.addr.toLowerCase();
    try {
      const count = await Message.countDocuments({ author: addr });
      return res.json({ count });
    } catch (err) {
      console.error("❌ GET /api/profile error:", err);
      return res.status(500).json({ error: "Could not load profile" });
    }
  });

  // 6) GET paged leaderboard
  app.get("/api/leaderboard", async (req, res) => {
    const page  = Math.max(0, parseInt(req.query.page, 10)  || 0);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);

    try {
      const agg = await Message.aggregate([
        // group by author
        { $group: { _id: "$author", count: { $sum: 1 } } },
        // sort by count desc
        { $sort:  { count: -1 } },
        // skip & limit for paging
        { $skip:  page * limit },
        { $limit: limit }
      ]);

      // format for client
      const result = agg.map(e => ({ author: e._id, count: e.count }));
      return res.json(result);
    } catch (err) {
      console.error("❌ GET /api/leaderboard error:", err);
      return res.status(500).json({ error: "Could not load leaderboard" });
    }
  });

  // 7) Serve static front-end
  const publicPath = path.join(__dirname, "..", "public");
  app.use(express.static(publicPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
  });

  // 8) Start the server
  const port = PORT || 3000;
  app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
  });
}

start().catch(err => {
  console.error("❌ Failed to start server:", err);
  process.exit(1);
});
