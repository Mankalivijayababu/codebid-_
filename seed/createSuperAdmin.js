require("dotenv").config();
const mongoose = require("mongoose");
const Admin = require("../models/Admin");
const connectDB = require("../config/db");

const run = async () => {
  await connectDB();

  const exists = await Admin.findOne({ email: "host@codebid.com" });

  if (exists) {
    console.log("⚠ Super admin already exists");
    process.exit();
  }

  await Admin.create({
    name: "Host Admin",
    email: "host@codebid.com",
    password: "host123",
    role: "superadmin",
  });

  console.log("✅ Super admin created successfully");
  process.exit();
};

run();
