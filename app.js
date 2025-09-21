// Import required modules
const path = require("path");
const express = require("express");
const morgan = require('morgan');
const winston = require('winston');
const dotenv = require("dotenv");
const flash = require("connect-flash");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const swaggerUi = require('swagger-ui-express');
const swaggerDocs = require('./swaggerOptions');
const DailyRotateFile = require('winston-daily-rotate-file');
const session = require("express-session");
const FileStore = require('session-file-store')(session);
const passport = require("passport");
// Passport Config
require("./passport-config")(passport);

// Initialize the Express app
const app = express();

// Load environment variables from .env file
dotenv.config();

// Set up middlewares
app.use(morgan("dev"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Set up logs
const date = new Date();
const hour = date.getHours();
const logPath = path.join('logs', date.toISOString().split('T')[0], `${hour}.log`);
const logger = winston.createLogger({
  format: winston.format.json(),
  transports: [
    new DailyRotateFile({
      filename: logPath,
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    })
  ]
});

app.use(morgan('tiny', {
  stream: {
    write: (message) => {
      logger.info(message.trim());
    }
  }
}));

app.use((req, res, next) => {
  if (req.method === 'POST') {
    logger.info(`POST Payload: ${JSON.stringify(req.body)}`);
  }
  
  const originalSend = res.send;
  
  res.send = function (body) {
    logger.info(`Response: ${body}`);
    originalSend.call(this, body);
  };
  
  next();
});

// Express session
app.use(
  session({
    // store: new FileStore(),
    secret: "b1sm1llah",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 14400000 },
  })
);

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

app.use(flash());
app.use((req, res, next) => {
  res.locals.error = req.flash("error");
  res.locals.success = req.flash("success");
  next();
});

// Set local
app.use((req, res, next) => {
  res.locals.appName = process.env.APP_NAME;
  next();
});

// Views
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("MongoDB connected")
    
    // start add task queue
    queueManager();
  })
  .catch((error) => console.error("MongoDB connection error:", error));


app.use('/uploads', express.static('uploads'));
app.use('/invoices', express.static('invoices'));


// Set up routes
const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const usersRoutes = require("./routes/users");
const logRPARoutes = require("./routes/logRPA");
const billingRoutes = require("./routes/billing");
const apiRoutes = require("./routes/api");
const { queueManager } = require("./helpers/emailQueue");
app.use("/auth", authRoutes);
app.use("/", dashboardRoutes);
app.use("/logs", logRPARoutes);
app.use("/billing", billingRoutes);
app.use("/users", usersRoutes);

// API
app.use("/api", apiRoutes);

// API Doc
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
