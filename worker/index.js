const Bottleneck = require("bottleneck");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");
const emailQueue = require("../queue/emailQueue");

dotenv.config();

// Setup rate limiter
const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 7000,
});

const transporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  tls: {
    ciphers: "SSLv3",
  },
});

const sendEmail = (emailData) => {
  let to = emailData.to;
  if (process.env.USE_EMAIL_TESTING === "yes") {
    to = process.env.EMAIL_TESTING;
  }

  if (!emailData.cc) {
    emailData.cc = null;
  }

  let mailOptions = {
    from: `"Billing Monitor" <${process.env.EMAIL_USER}>`,
    to,
    subject: emailData.subject,
    text: emailData.text,
    html: emailData.html,
    attachments: emailData.attachments,
    cc: emailData.cc,
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.error("Couldn't send email:", err);
    } else {
      console.log("Email sent:", info.response);
    }
  });
};

emailQueue.process(async (job) => {
  await limiter.schedule(() => sendEmail(job.data));
  return "done";
});

console.log("Worker started...");
