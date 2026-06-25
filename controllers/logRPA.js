const moment = require("moment-timezone");
const ObjectId = require("mongodb").ObjectId;
const mongoose = require("mongoose");
const { createQueryString } = require("../helpers/createQueryString");
const fs = require('fs').promises;
const path = require('path');

const buildLogRPAQuery = (params) => {
  const {
    accountID,
    customerName,
    clNumber,
    invoiceNo,
    clDate,
    invoiceDate,
    emailSent,
    status,
    statusRemark,
  } = params;

  const query = {};
  if (accountID) {
    const itemsArray = accountID?.split(",")?.map((item) => {
      return {
        "invoiceDetail.customer": { $regex: item.trim(), $options: "i" },
      };
    });

    if (itemsArray.length > 0) {
      query.$or = itemsArray;
    }
  }

  if (customerName) {
    const itemsArray = customerName?.split(",")?.map((item) => {
      return {
        "invoiceDetail.cloCustName": { $regex: item.trim(), $options: "i" },
      };
    });

    if (itemsArray.length > 0) {
      query.$or = itemsArray;
    }
  }

  if (clNumber) {
    const itemsArray = clNumber?.split(',')?.map(item => {
      return { clNumber: { $regex: item.trim(), $options: "i" } };
    });

    if (itemsArray.length > 0) {
      query.$or = itemsArray;
    }
  }

  if (invoiceNo) {
    const itemsArray = invoiceNo?.split(',')?.map(item => {
      return { invoiceNumber: { $regex: item.trim(), $options: "i" } };
    });

    if (itemsArray.length > 0) {
      query.$or = itemsArray;
    }
  }

  if (clDate) {
    const [start, end] = clDate.split(" - ");
    const startDate = new Date(`${start}T00:00:00.000Z`);
    const endDate = new Date(`${end}T23:59:59.999Z`);
    query["invoiceDetail.cldate"] = {
      $gte: startDate,
      $lt: endDate,
    };
  }

  if (invoiceDate) {
    const [start, end] = invoiceDate.split(" - ");
    const startDate = new Date(`${start}T00:00:00.000Z`);
    const endDate = new Date(`${end}T23:59:59.999Z`);
    query["invoiceDetail.invdate"] = {
      $gte: startDate,
      $lt: endDate,
    };
  }

  // if (emailSent) query["emailSentTo"] = emailSent;

  if (status) {
    query["statuses"] = { $in: [status] };
  }

  if (statusRemark) {
    query["statusRemark"] = { $in: [statusRemark] };
  }

  query["status"] = { $ne: "cancelled" };

  return query;
};

exports.fetch = async (req, res) => {
  try {
    let query = buildLogRPAQuery(req.query);

    const { page = 1, pageSize = 10 } = req.query;

    const skip = (page - 1) * pageSize;
    const limit = parseInt(pageSize);

    const db = mongoose.connection;
    const collection = db.collection("logRPA");

    const logs = await collection.find(query).skip(skip).limit(limit).toArray();
    const totalLogs = await collection.countDocuments(query);

    const totalPages = Math.ceil(totalLogs / pageSize);
    const startIdx = skip + 1;
    const endIdx = skip + logs.length;

    const queryString = createQueryString({ ...req.query });

    res.render("document", {
      queryString,
      moment,
      user: req.user,
      logs,
      currentPage: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages,
      startIdx,
      endIdx,
      totalLogs,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
};

exports.cancelInvoice = async (req, res) => {
  // Force console output
  process.stdout.write("=== CANCEL INVOICE PROCESS STARTED ===\n");
  console.info("=== CANCEL INVOICE PROCESS STARTED ===");
  console.error("=== CANCEL INVOICE PROCESS STARTED (ERROR STREAM) ===");

  try {
    const { clNumber, cancellationReason } = req.body;
    console.info("Request data received:", { clNumber, cancellationReason });

    const db = mongoose.connection;
    const collection = db.collection("logRPA");
    console.info("Database connection established");

    // Get invoice data before updating
    const invoiceData = await collection.findOne({ clNumber: clNumber });
    console.info("Invoice data found:", invoiceData ? "Yes" : "No");
    if (invoiceData) {
      console.info("Invoice details:", {
        id: invoiceData._id,
        status: invoiceData.status,
        clNumber: invoiceData.clNumber
      });
    }

    const updateResult = await collection.updateMany(
      { clNumber: clNumber },
      {
        $set: {
          status: "cancelled",
          cancellationReason: cancellationReason || "",
          cancelledOn: new Date().toISOString(),
          modifiedOn: new Date().toISOString(),
        },
      }
    );
    console.info("Database update result:", {
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount
    });

    // Note: Email notification functionality has been moved to billing.js rejectInvoice function

    console.info("=== CANCEL INVOICE PROCESS COMPLETED ===");
    console.info("Redirecting to /document");
    return res.redirect("/document");
  } catch (error) {
    console.error("❌ CANCEL INVOICE ERROR:", error);
    console.error("Error stack:", error.stack);
    res.status(500).send("Server error");
  }
};

// Helper to escape a CSV field value
const escapeCSVField = (value) => {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
};

exports.exports = async (req, res) => {
  try {
    const { reportType, queryString } = req.body;

    const params = new URLSearchParams(queryString);

    const searchParam = {};
    params.forEach((value, key) => {
      searchParam[key] = value;
    });

    let logRPAs = [];

    const db = mongoose.connection;
    const collection = db.collection("logRPA");

    if (reportType === "ENTIRE") {
      const ENTIRE_DIR = path.join(__dirname, '..', 'exports', 'entire');
      try {
        await fs.access(ENTIRE_DIR);
      } catch {
        return res.status(404).json({
          error: 'Export directory not found',
          message: 'Folder exports/entire/ belum tersedia.',
        });
      }

      const files = await fs.readdir(ENTIRE_DIR);
      const csvFiles = files.filter(f => f.endsWith('.csv'));
      if (csvFiles.length === 0) {
        return res.status(404).json({
          error: 'No CSV file found',
          message: 'Belum ada file CSV di folder exports/entire/.',
        });
      }

      const fileStats = await Promise.all(
        csvFiles.map(async (fileName) => {
          const filePath = path.join(ENTIRE_DIR, fileName);
          const stat = await fs.stat(filePath);
          return { fileName, filePath, mtime: stat.mtime };
        })
      );
      fileStats.sort((a, b) => b.mtime - a.mtime);

      const latest = fileStats[0];
      const buffer = await fs.readFile(latest.filePath);

      // Buat random angka menggunakan epoch timestamp (sama seperti CURRENT)
      const epoch = new Date().getTime().toString();
      const randomFileName = `available-document-entire-${epoch}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${randomFileName}"`);
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);
    }

    if (reportType === "CURRENT") {
      const page = Math.max(parseInt(searchParam.page, 10) || 1, 1);
      const parsedPageSize = parseInt(searchParam.pageSize, 10);
      const pageSize = Number.isNaN(parsedPageSize)
        ? 10
        : Math.min(Math.max(parsedPageSize, 1), 500);
      const skip = (page - 1) * pageSize;

      // Remove pagination params so they don't interfere with query building
      delete searchParam.page;
      delete searchParam.pageSize;

      const query = buildLogRPAQuery(searchParam);
      logRPAs = await collection.find(query).skip(skip).limit(pageSize).toArray();
    } else {
      return res.status(400).json({
        error: 'Invalid export type',
        message: `Export type "${reportType}" is not supported.`,
      });
    }

    const epoch = new Date().getTime().toString();
    const fileName = `available-document-${reportType.toLowerCase()}-${epoch}.csv`;

    // Build CSV content directly (no file system required)
    const headers = [
      'ACCOUNT ID',
      'CUSTOMER NAME',
      'CL NUMBER',
      'CL DATE',
      'INVOICE NO',
      'INVOICE DATE',
      'EMAIL SENDING DATE',
      'STATUS',
      'STATUS REMARK',
    ];

    const rows = logRPAs.map((item) => [
      item.invoiceDetail?.customer || '',
      item.invoiceDetail?.cloCustName || '',
      item.invoiceDetail?.clnumber || '',
      item.invoiceDetail?.cldate ? moment(item.invoiceDetail.cldate).format('MM/DD/YYYY') : '',
      item.invoiceDetail?.invoiceno || '',
      item.invoiceDetail?.invdate ? moment(item.invoiceDetail.invdate).format('MM/DD/YYYY') : '',
      item.emailSendDate ? moment(item.emailSendDate).format('MM/DD/YYYY HH:mm') : '-',
      item?.statuses?.join(',') || '',
      item?.statusRemark?.join(',') || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(escapeCSVField).join(','))
    ].join('\r\n');

    const buffer = Buffer.from(csvContent, 'utf-8');

    // Save CSV file to exports folder for record-keeping
    const exportsDir = path.join(__dirname, '..', 'exports');
    const filePath = path.join(exportsDir, fileName);
    try {
      await fs.mkdir(exportsDir, { recursive: true });
      await fs.writeFile(filePath, buffer);
      console.log(`CSV file saved to: ${filePath}`);
    } catch (writeErr) {
      // Log file write error but don't fail the export — download still proceeds
      console.error('Failed to save CSV to exports folder:', writeErr.message);
    }

    // Send CSV buffer directly to the user for immediate download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    console.error('Error in logRPA exports():', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ error: 'Failed to generate export file', message: error.message });
  }
};
