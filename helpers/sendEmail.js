const nodemailer = require("nodemailer");
const { mongoQueue, addQueue } = require('./emailQueue');
const mongoose = require("mongoose");
const ObjectId = require("mongodb").ObjectId;

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

    console.log("Sending Email To -> ", to);

    // Siapkan data email yang akan dikirim
    let mailOptions = {
      from: `"Billing Monitor" <${process.env.EMAIL_USER}>`,
      to,
      subject: emailData.subject,
      text: emailData.text,
      html: emailData.html,
      attachments: emailData.attachments,
      cc: emailData.cc,
    };

    // Masukkan task ke dalam antrian dengan status "in-progress"
    const taskData = {
      data: mailOptions,  // Menyimpan data email dalam antrian
      status: "in-progress", // Status awal
    };

    // Menambahkan task ke dalam queue MongoDB
    const taskId = await addQueue(queue, taskData);

    // Kembalikan task ID ke frontend tanpa menunggu proses pengiriman email selesai
    console.log(`Email ${taskData.data.to} task added to queue with ID: ${taskId}`);

    // Proses task email segera
    this.processQueue(queue);
    
    return taskId;
  } catch (error) {
    console.error("Couldn't send email:", error);
  }
};

// Fungsi untuk memproses antrian dan mengirim email
exports.processQueue = async (queue) => {
  let task = await queue.get();

  if (task) {
    try {
      let data = task?.payload?.data;

      await transporter.sendMail({
        from: `"Billing Monitor" <${process.env.EMAIL_USER}>`,
        to: data.to,
        subject: data.subject,
        text: data.text,
        html: data.html,
        attachments: data.attachments,
        cc: data.cc,
      });

      // Memperbarui status task menjadi "sent"
      task.payload.status = "sent";

      // Update status di database (MongoDB)
      const db = mongoose.connection.db;
      const schaduler = db.collection("emailSchaduler");
      await schaduler.updateOne({ _id: new ObjectId(task.id) }, { $set: task });

      console.log(`Email ${data.to} successfully sent with Task ID: ${task.id}`);
      console.log("Email sent successfully");
      await queue.ack(task.ack); // Mengakui task setelah diproses
    } catch (error) {
      console.error("Error while sending email:", error);
      task.payload.status = "failed";
      task.payload.transport = error;

      // Menyimpan status gagal di database
      const db = mongoose.connection.db;
      const schaduler = db.collection("emailSchaduler");
      await schaduler.updateOne({ _id: task.id }, { $set: task.payload });

      await queue.ack(task.ack); // Mengakui task meskipun gagal
    }
  } else {
    console.log('No email tasks in the queue');
  }
};

module.exports = sendEmail
