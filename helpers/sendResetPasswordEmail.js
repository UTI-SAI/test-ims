const emailQueue = require("../queue/emailQueue");
const encrypt = require("./encrypt");
const fs = require("fs");
const path = require("path");

const sendResetPasswordEmail = async (to, id) => {
  try {
    const token = encrypt(id);

    // Load HTML Template
    const filePath = path.join(
      __dirname,
      "../public/static/html/reset-password.html"
    );
    const htmlString = fs.readFileSync(filePath, "utf8");
    const resetLink = `${process.env.HOST}/auth/reset-password/${token}}`;
    const emailHtml = htmlString.replace("YOUR_RESET_PASSWORD_LINK", resetLink);

    const emailData = {
      from: process.env.EMAIL_USER,
      to: to,
      subject: "Password Reset Request",
      html: emailHtml,
    };

    const job = emailQueue.createJob(emailData);
    job.save();

    job.on("succeeded", (result) => {
      console.log(`Sent email to ${emailData.to}`);
    });
  } catch (error) {
    console.error(error);
  }
};

module.exports = sendResetPasswordEmail;
