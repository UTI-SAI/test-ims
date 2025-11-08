const moment = require("moment-timezone");
const ObjectId = require("mongodb").ObjectId;
const mongoose = require("mongoose");
const { createQueryString } = require("../helpers/createQueryString");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const sendEmail = require("../helpers/sendEmail");
const { generateRejectInvoiceEmail } = require("../helpers/generateRejectInvoiceEmail");

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
  try {
    const { clNumber, cancellationReason } = req.body;
    const db = mongoose.connection;
    const collection = db.collection("logRPA");

    // Get invoice data before updating
    const invoiceData = await collection.findOne({ clNumber: clNumber });

    await collection.updateMany(
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

    // Send email notification
    try {
      // Generate document number (format: ddMmmyyyy + sequence, e.g. "24Feb01326")
      const now = new Date();
      const dateString = moment(now).format("DDMMMYYYY").replace(/^0/, ''); // Remove leading zero from day
      const sequence = Math.floor(Math.random() * 100000).toString().padStart(5, '0'); // Generate 5-digit sequence
      const documentNumber = dateString + sequence;

      // Prepare email data
      const emailData = {
        documentNumber: documentNumber,
        invoices: [
          {
            clNumber: clNumber,
            reason: cancellationReason || "No reason provided"
          }
        ]
      };

      // Generate email HTML content
      const emailHtml = generateRejectInvoiceEmail(emailData);

      // Send email
      if (emailHtml) {
        await sendEmail({
          to: "tiar.agisti@gmail.com", // Hardcoded email for now
          subject: `Invoice Rejected Notification - Doc ${documentNumber}`,
          html: emailHtml,
          text: `Invoice ${clNumber} has been rejected. Reason: ${cancellationReason}`
        });

        console.log(`Reject notification email sent for CL Number: ${clNumber}`);
      }
    } catch (emailError) {
      console.error("Error sending reject notification email:", emailError);
      // Don't fail the main operation if email fails
    }

    return res.redirect("/document");
  } catch (error) {
    console.error(error);
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
