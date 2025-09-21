// const Queue = require("bee-queue");
// const emailQueue = new Queue("email-processing", {
//   redis: {
//     host: "redis-13924.c252.ap-southeast-1-1.ec2.cloud.redislabs.com",
//     port: 13924,
//     password: "U9j7P8TRQIdhDR2CCHeya3wFEveufllY",
//   },
//   // redis: {
//   //   host: "127.0.0.1",
//   //   port: 6379,
//   // },
// });

// module.exports = emailQueue;

const mongoose = require("mongoose");
const MongoDBQueue = require('@openwar/mongodb-queue');
const sendEmail = require("../helpers/sendEmail");


exports.mongoQueue = async () => {
    const db = mongoose.connection.db;
    const queue = await new MongoDBQueue(db, 'emailSchaduler');
    // this.addQueue(queue, "test")
    return queue;
};

exports.addQueue = async (queue, email) => {
    const id = await queue.add(email);
    console.log(`Email task added to queue with ID: ${id}`);
};

// exports.processQueue = async (queue) => {
//     const task = await queue.get();
//     if (task) {
//         console.log(`Processing email task: ${task.payload}`);
//         await sendEmail(task.payload);
//         await queue.ack(task.ack);
//         console.log(`Email task ${task.id} completed`);
//     } else {
//         console.log('No email tasks in the queue');
//     }
// };
