// backend/models/Message.js
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  id:        { type: Number, unique: true },
  author:    String,
  text:      String,
  timestamp: Number
});

module.exports = mongoose.model("Message", messageSchema);
