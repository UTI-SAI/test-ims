const { MongoClient } = require("mongodb");

// Konfigurasi MongoDB URI
const uri = "mongodb://127.0.0.1:27017"; // Sesuaikan dengan konfigurasi Anda
const dbName = "billing-monitoring";
const collectionName = "logRPA";

async function updateStatusRemark() {
  const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000, // Set timeout 30 detik
  });

  try {
    // Koneksi ke MongoDB
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    // Query untuk filter dokumen yang akan diupdate
    const filter = {
      statusRemark: { $elemMatch: { $eq: "NEED SIGN & STAMP" } },
    };

    // Update dokumen
    const update = {
      $set: {
        "statusRemark.$": "NEED STATUS SUPPDOC", // Update elemen array pertama yang cocok
      },
    };

    // Jalankan update
    const result = await collection.updateMany(filter, update);

    console.log(`${result.modifiedCount} documents updated.`);
  } catch (err) {
    console.error("Error updating documents:", err);
  } finally {
    // Tutup koneksi
    await client.close();
    console.log("Connection closed.");
  }
}

updateStatusRemark();
