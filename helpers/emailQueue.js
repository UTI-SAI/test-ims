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


exports.mongoQueue = async () => {
    const db = mongoose.connection.db;
    const queue = await new MongoDBQueue(db, 'emailSchaduler');
    // this.addQueue(queue, "test")
    return queue;
};

exports.addQueue = async (queue, task) => {
    const id = await queue.add(task);
    console.log(`Email task added to queue with ID: ${id}`);
    return id;
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

exports.queueManager = async () => {
    try {
        const queue = await this.mongoQueue();
        const db = mongoose.connection;
        const collection = await db.collection("emailSchaduler");
        const tasks = await collection.find({ "payload.status": "in-progress" }).toArray();
        if (tasks.length > 0) {
            console.info(`[EMAIL_QUEUE] Found ${tasks.length} in-progress tasks`);
            const sendEmail = require("./sendEmail.js");
            for (let i = 0; i < tasks.length; i++) {
                console.info(`[EMAIL_QUEUE] Processing recovery task ${i + 1}/${tasks.length} with ID: ${tasks[i]._id}`);
                await sendEmail.processQueue(queue);
            }
        } else {
            console.info("[EMAIL_QUEUE] No in-progress tasks to recover");
        }
    } catch (error) {
        console.error("[EMAIL_QUEUE] queueManager error:", error);
    }
};
