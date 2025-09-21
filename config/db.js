const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect("YOUR_MONGODB_URI", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
    });
    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1); // Exit process with failure
  }
};

module.exports = connectDB;
