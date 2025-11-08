const moment = require("moment-timezone");
const ObjectId = require("mongodb").ObjectId;
const mongoose = require("mongoose");
const { createQueryString } = require("../helpers/createQueryString");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

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

exports.exports = async (req, res) => {
  const { HOST } = process.env;
  const { reportType, queryString } = req.query;

  const params = new URLSearchParams(queryString);

  const searchParam = {};
  params.forEach((value, key) => {
    searchParam[key] = value;
  });

  let logRPAs = [];

  const db = mongoose.connection;
  const collection = db.collection("logRPA");

  if (reportType === "CURRENT") {
    const query = buildLogRPAQuery(searchParam);
    logRPAs = await collection.find(query).toArray();
  } else {
    logRPAs = await collection.find().toArray();
  }

  const epoch = new Date().getTime().toString();
  const fileName = `./exports/available-document-${reportType.toLowerCase()}-${epoch}.csv`;

  const csvWriter = createCsvWriter({
    path: fileName,
    header: [
      { id: "accountID", title: "ACCOUNT ID" },
      { id: "customerName", title: "CUSTOMER NAME" },
      { id: "clNumber", title: "CL NUMBER" },
      { id: "clDate", title: "CL DATE" },
      { id: "invoiceNo", title: "INVOICE NO" },
      { id: "invoiceDate", title: "INVOICE DATE" },
      { id: "emailSendDate", title: "EMAIL SENDING DATE" },
      { id: "status", title: "STATUS" },
      { id: "statusRemark", title: "STATUS REMARK" },
    ],
  });

  const flatData = logRPAs.map((item) => ({
    accountID: item.invoiceDetail.customer,
    customerName: item.invoiceDetail.cloCustName,
    clNumber: item.invoiceDetail.clnumber,
    clDate: moment(item.invoiceDetail.cldate).format("MM/DD/YYYY"),
    invoiceNo: item.invoiceDetail.invoiceno,
    invoiceDate: moment(item.invoiceDetail.invdate).format("MM/DD/YYYY"),
    emailSendDate: item.emailSendDate
      ? moment(item.emailSendDate).format("MM/DD/YYYY HH:mm")
      : "-",
    status: item?.statuses?.join(","),
    statusRemark: item?.statusRemark?.join(","),
  }));

  csvWriter.writeRecords(flatData).then(() => {
    res.download(fileName);
  });
};
