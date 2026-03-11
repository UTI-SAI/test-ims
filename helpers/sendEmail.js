const nodemailer = require("nodemailer");
const { mongoQueue, addQueue } = require('./emailQueue');
const mongoose = require("mongoose");
const ObjectId = require("mongodb").ObjectId;

const transporter = nodemailer.createTransport({
  host: "mail.tmt.co.id",
  port: 25,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  tls: {
    ciphers: "SSLv3",
  },
});

const buildErrorDetails = (error) => ({
  message: error?.message || String(error),
  code: error?.code || null,
  command: error?.command || null,
  response: error?.response || null,
  responseCode: error?.responseCode || null,
  rejected: Array.isArray(error?.rejected) ? error.rejected : [],
  timestamp: new Date().toISOString(),
});

const processQueue = async (queue) => {
  const task = await queue.get();

  if (!task) {
    console.info("[EMAIL_QUEUE] No pending tasks in queue");
    return;
  }

  const data = task?.payload?.data || {};
  const taskId = task?.id || null;

  try {
    console.info("[EMAIL_QUEUE] Sending email", {
      taskId,
      to: data.to,
      cc: data.cc,
      subject: data.subject,
    });

    const result = await transporter.sendMail({
      from: `\"Billing Support\" <${process.env.EMAIL_USER}>`,
      to: data.to,
      subject: data.subject,
      text: data.text,
      html: data.html,
      attachments: data.attachments,
      cc: data.cc,
    });

    task.payload.status = "sent";
    task.payload.sentAt = new Date().toISOString();
    task.payload.providerResponse = result?.response || null;

    const db = mongoose.connection.db;
    const schaduler = db.collection("emailSchaduler");
    await schaduler.updateOne(
      { _id: new ObjectId(task.id) },
      { $set: { payload: task.payload } }
    );

    console.info("[EMAIL_QUEUE] Email sent", {
      taskId,
      to: data.to,
      response: result?.response,
    });

    await queue.ack(task.ack);
  } catch (error) {
    const errorDetails = buildErrorDetails(error);

    console.error("[EMAIL_QUEUE] Failed to send email", {
      taskId,
      to: data.to,
      subject: data.subject,
      error: errorDetails,
    });

    task.payload.status = "failed";
    task.payload.failedAt = new Date().toISOString();
    task.payload.error = errorDetails;

    const db = mongoose.connection.db;
    const schaduler = db.collection("emailSchaduler");
    await schaduler.updateOne(
      { _id: new ObjectId(task.id) },
      { $set: { payload: task.payload } }
    );

    await queue.ack(task.ack);
  }
};

// Fungsi untuk mengirim email
const sendEmail = async (emailData) => {
  try {
    const queue = await mongoQueue(); // Mendapatkan queue dari MongoDB

    // Tentukan penerima email
    let to = emailData.to;
    if (!emailData.cc) {
      emailData.cc = null;
    }

    if (process.env.USE_EMAIL_TESTING === "yes") {
      to = process.env.EMAIL_TESTING;
    }

    console.info("[EMAIL_QUEUE] Enqueue email request", {
      to,
      cc: emailData.cc,
      subject: emailData.subject,
      useTestingEmail: process.env.USE_EMAIL_TESTING === "yes",
    });

    // Siapkan data email yang akan dikirim
    const mailOptions = {
      from: `"Billing Support" <${process.env.EMAIL_USER}>`,
      to,
      subject: emailData.subject,
      text: emailData.text,
      html: emailData.html,
      attachments: emailData.attachments,
      cc: emailData.cc,
    };

    // Masukkan task ke dalam antrian dengan status "in-progress"
    const taskData = {
      data: mailOptions,
      status: "in-progress",
      enqueuedAt: new Date().toISOString(),
    };

    // Menambahkan task ke dalam queue MongoDB
    const taskId = await addQueue(queue, taskData);

    // Kembalikan task ID ke frontend tanpa menunggu proses pengiriman email selesai
    console.info("[EMAIL_QUEUE] Task added", {
      taskId,
      to: taskData.data.to,
      subject: taskData.data.subject,
    });

    // Process immediately without blocking API response.
    processQueue(queue).catch((error) => {
      console.error("[EMAIL_QUEUE] processQueue runtime error", {
        taskId,
        error: buildErrorDetails(error),
      });
    });

    return taskId;
  } catch (error) {
    console.error("[EMAIL_QUEUE] Couldn't enqueue email", buildErrorDetails(error));
  }
};

sendEmail.processQueue = processQueue;

module.exports = sendEmail;
