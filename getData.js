const mongoose = require('mongoose');

// Koneksi ke database
mongoose.connect('mongodb://127.0.0.1:27017/billing-monitoring', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Database connected');

    // Mengakses collection 'logRPA' langsung melalui mongoose.connection
    const db = mongoose.connection;
    const rpa = db.collection("logRPA");

    // List clnumber yang ingin dicari
    const clnumbers = [
        '25Jan00054', '25Jan00055',
        '25Jan00056', '25Jan00057', '25Jan00058', '25Jan00059', '25Jan00060',
        '25Jan00061', '25Jan00062', '25Jan00063', '25Jan00064', '25Jan00065',
        '25Jan00068', '25Jan00070', '25Jan00071', '25Jan00072', '25Jan00073',
        '25Jan00074', '25Jan00075', '25Jan00076', '25Jan00077', '25Jan00079',
        '25Jan00080', '25Jan00081'
      ];

    // Menggunakan db.collection untuk mencari data berdasarkan clnumber
    rpa.find({ clNumber: { $in: clnumbers } }).toArray()
      .then(results => {
        let groupedResults = [];

        // Proses untuk mengelompokkan data berdasarkan clNumber
        results.forEach(result => {
          // Mencari apakah sudah ada entry dengan clNumber yang sama
          let existingEntry = groupedResults.find(item => item.clNumber === result.clNumber);

          if (existingEntry) {
            // Jika ada, tambahkan invoiceNo ke array yang sudah ada
            existingEntry.invoiceNo.push(result.invoiceNumber);
          } else {
            // Jika belum ada, buat entry baru
            groupedResults.push({
              clNumber: result.clNumber,
              ignoreEmail: true,
              invoiceNo: [result.invoiceNumber], // Masukkan invoiceNo ke dalam array
              cc: result.cc,
              subject: "string"
            });
          }
        });

        // Menampilkan hasil
        console.log(groupedResults.length);
        console.log(JSON.stringify(groupedResults, null, 2));


        mongoose.connection.close(); // Menutup koneksi setelah selesai
      })
      .catch(err => {
        console.log(err);
        mongoose.connection.close(); // Menutup koneksi jika ada error
      });
  })
  .catch(err => console.log(err));
