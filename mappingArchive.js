const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

// Path network
const networkPath = `\\\\CKB-A0000036932\\Archive - Paid Invoice`;

// Fungsi untuk menghasilkan timestamp
function generateTimestamp() {
    const now = new Date();
    return now.toISOString(); // Menghasilkan string ISO 8601
}

// Koneksi MongoDB URL
const url = 'mongodb://127.0.0.1:27017';
const dbName = 'billing-monitoring';

// Fungsi untuk membaca folder secara rekursif
async function readFolderRecursive(folderPath, counter = 0, directory = "") {
    const result = [];
    const items = fs.readdirSync(folderPath, { withFileTypes: true });

    const client = new MongoClient(url);

    try {
        await client.connect();
        console.log('Connected to MongoDB');
        const db = client.db(dbName);
        const logDirCollection = db.collection('logDir');

        for (const item of items) {
            let clNumber = "";

            if (counter === 0) {
                directory = item.name; // Set direktori
            }

            if (counter === 1) {
                clNumber = item.name; // Set clNumber
                const payload = {
                    Timestamp: generateTimestamp(),
                    clNumber,
                    directory
                };

                try {
                    // Insert payload ke MongoDB
                    const result = await logDirCollection.insertOne(payload);
                    console.log('Payload inserted', payload);
                } catch (err) {
                    console.error('Error inserting payload:', err.message);
                }
            }

            const fullPath = path.join(folderPath, item.name);

            let isDir = false;
            try {
                const stats = fs.statSync(fullPath);
                isDir = stats.isDirectory();
            } catch (err) {
                console.error(`Failed to check: ${fullPath}, Error: ${err.message}`);
            }

            if (isDir && counter < 2) {
                await readFolderRecursive(fullPath, counter + 1, directory);
            }
        }

    } catch (err) {
        console.error('Error connecting to MongoDB:', err.message);
    } finally {
        await client.close();
    }

    return result;
}

// Menjalankan program utama
(async function main() {
    try {
        // Jalankan fungsi recursive untuk membaca folder
        await readFolderRecursive(networkPath);
        console.log('Finished processing directories');
    } catch (err) {
        console.error('Error:', err.message);
    }
})();
