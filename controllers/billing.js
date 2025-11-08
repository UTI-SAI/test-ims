const moment = require("moment");
const ObjectId = require("mongodb").ObjectId;
const mongoose = require("mongoose");
const { createQueryString } = require("../helpers/createQueryString");
const listFilesInDirectory = require("../helpers/listFilesInDirectory");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const sendEmail = require("../helpers/sendEmail");
const { generateRejectInvoiceEmail } = require("../helpers/generateRejectInvoiceEmail");

exports.fetch = async (req, res) => {
  try {
    let query = buildBillingSearchQuery(req.query);

    const { page = 1, pageSize = 10 } = req.query;

    const skip = (page - 1) * pageSize;
    const limit = parseInt(pageSize);

    const db = mongoose.connection;
    const collection = db.collection("billing");

    let billing = await collection
      .find(query)
      .skip(skip)
      .limit(limit)
      .toArray();

    billing.map((item) => {
      if (item.rejectionReason) {
        // Mengganti newline dengan spasi atau string kosong
        item.rejectionReason = item.rejectionReason.replace(/[\r\n]+/g, " "); // Ganti newline dengan spasi
      }
    });

    const totalBilling = await collection.countDocuments(query);

    const totalPages = Math.ceil(totalBilling / pageSize);
    const startIdx = skip + 1;
    const endIdx = skip + billing.length;

    const queryString = createQueryString({ ...req.query });

    res.render("home", {
      queryString,
      moment,
      user: req.user,
      billing,
      currentPage: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages,
      startIdx,
      endIdx,
      totalBilling,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
};

exports.fetchCustomerBilling = async (req, res) => {
  try {
    const { LOG_RPA_PATH } = process.env;
    const {
      accountID,
      customerName,
      clNumber,
      invoiceNo,
      clDate,
      invoiceDate,
      emailSent,
      billingStatus,
      id,
      logId,
      range,
      page = 1,
      pageSize = 10,
    } = req.query;

    const skip = (page - 1) * pageSize;
    const limit = parseInt(pageSize);

    const query = {};
    if (accountID) query["accountID"] = accountID;
    if (customerName)
      query["cloCustName"] = {
        $regex: customerName,
        $options: "i",
      };
    if (clNumber) query["clnumber"] = clNumber;
    if (invoiceNo) query["invoiceno"] = invoiceNo;
    if (clDate) {
      const startDate = new Date(`${clDate}T00:00:00.000Z`);
      const endDate = new Date(`${clDate}T23:59:59.999Z`);
      query["invoice.cldate"] = {
        $gte: startDate,
        $lt: endDate,
      };
    }

    if (range) {
      const [start, end] = range.split(" - ");
      const startDate = new Date(`${start}T00:00:00.000Z`);
      const endDate = new Date(`${end}T23:59:59.999Z`);
      query["invoice.invdate"] = {
        $gte: startDate,
        $lt: endDate,
      };
    }

    if (invoiceDate) {
      const startDate = new Date(`${invoiceDate}T00:00:00.000Z`);
      const endDate = new Date(`${invoiceDate}T23:59:59.999Z`);
      query["invoice.invdate"] = {
        $gte: startDate,
        $lt: endDate,
      };
    }

    if (emailSent) {
      query["emailSent"] = {
        $in: emailSent.split(","),
      };
    }

    // if (billingStatus === 'EMAIL_READ') {
    //   query["customerDownloadHistory"] = { $gt: [{ $size: "$customerDownloadHistory" }, 0] };
    // } else if (billingStatus === 'EMAIL_SENT') {
    //   query["customerDownloadHistory"] = { $size: 0 };
    // } {
    //   query["billingStatus"] = billingStatus;
    // }

    if (billingStatus) {
      if (billingStatus === "EMAIL_READ") {
        query["customerDownloadHistory"] = {
          $gt: [{ $size: "$customerDownloadHistory" }, 0],
        };
        query["$or"] = [
          { billingStatus: { $exists: false } }, // Kondisi ketika `billingStatus` tidak ada
          { billingStatus: { $ne: "PAID" } }, // Kondisi ketika `billingStatus` bukan "PAID"
        ];
      } else if (billingStatus === "UNPAID") {
        query["customerDownloadHistory"] = { $size: 0 };
        query["$or"] = [
          { billingStatus: { $exists: false } }, // Kondisi ketika `billingStatus` tidak ada
          { billingStatus: { $ne: "PAID" } }, // Kondisi ketika `billingStatus` bukan "PAID"
        ];
      } else if (billingStatus === "REJECTED") {
        query["isRejected"] = true;
      } else {
        query["billingStatus"] = billingStatus; // CANCELLED Situation handled on here
      }
    }

    console.log("query", query);

    if (id) {
      query["_id"] = new ObjectId(id);
    }

    if (logId) {
      query["logId"] = new ObjectId(logId);
    }

    // Filter by account id
    const clonedUser = JSON.parse(JSON.stringify(req.user));

    if (req.query.accountID) {
      query["accountID"] = { $eq: req.query.accountID };
    } else {
      query["accountID"] = { $in: clonedUser.accountID };
    }
    console.log({
      req: req.user,
      clonedUser,
    });
    // query["billingStatus"] = { $ne: "CANCELLED" };

    const db = mongoose.connection;
    const collection = db.collection("billing");

    const billing = await collection
      .find(query)
      .skip(skip)
      .limit(limit)
      .toArray();

    const totalBilling = await collection.countDocuments(query);

    const totalPages = Math.ceil(totalBilling / pageSize);
    const startIdx = skip + 1;
    const endIdx = skip + billing.length;

    const queryString = createQueryString({ ...req.query });

    res.render("customerDocument", {
      queryString,
      moment,
      user: req.user,
      billing,
      LOG_RPA_PATH,
      currentPage: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages,
      startIdx,
      endIdx,
      totalBilling,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
};

exports.attachFile = async (req, res) => {
  const { clNumber } = req.body;

  const db = mongoose.connection;
  const collection = db.collection("billing");

  const files = await listFilesInDirectory("uploads");

  const filteredFiles = files
    .filter((file) => file.name.includes(clNumber))
    .sort((a, b) => b.addedDate - a.addedDate);

  const summaryFile = filteredFiles.length > 0 ? filteredFiles[0] : null;

  if (summaryFile) {
    await collection.updateMany(
      { clnumber: clNumber },
      { $set: { excelSummaryInvoice: summaryFile.name } },
      (err, result) => {
        if (err) {
          console.error("Error:", err);
        } else {
          console.log(
            "Matched:",
            result.matchedCount,
            "Modified:",
            result.modifiedCount
          );
        }
      }
    );
  }

  return res.redirect("/billing");
};

exports.cancel = async (req, res) => {
  const { cancellationReason, clNumber, id, type } = req.body;

  const db = mongoose.connection;
  const collection = db.collection("billing");

  if (type === "ENTIRE") {
    await collection.updateMany(
      { clnumber: clNumber },
      {
        $set: {
          billingStatus: "CANCELLED",
          cancellationReason,
        },
      },
      (err, result) => {
        if (err) {
          console.error("Error:", err);
        } else {
          console.log(
            "Matched:",
            result.matchedCount,
            "Modified:",
            result.modifiedCount
          );
        }
      }
    );
  }

  if (type === "CURRENT") {
    await collection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          billingStatus: "CANCELLED",
          cancellationReason,
        },
      },
      (err, result) => {
        if (err) {
          console.error("Error:", err);
        } else {
          console.log(
            "Matched:",
            result.matchedCount,
            "Modified:",
            result.modifiedCount
          );
        }
      }
    );
  }

  return res.redirect("/billing");
};

exports.rejectInvoice = async (req, res) => {
  console.info("=== REJECT INVOICE PROCESS STARTED ===");
  try {
    const { rejectionReason, id } = req.body;
    console.info("Request data received:", { rejectionReason, id });

    const db = mongoose.connection;
    const collection = db.collection("billing");
    console.info("Database connection established");

    // Get invoice data before updating
    const invoiceData = await collection.findOne({ _id: new ObjectId(id) });
    console.info("Invoice data found:", invoiceData ? "Yes" : "No");
    if (invoiceData) {
      console.info("Invoice details:", {
        id: invoiceData._id,
        clNumber: invoiceData.invoice?.clnumber,
        accountID: invoiceData.accountID
      });
    }

    const updateResult = await collection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          isRejected: true,
          rejectionReason: rejectionReason,
          rejectedOn: new Date().toISOString(),
          modifiedOn: new Date().toISOString(),
        },
      }
    );

    console.info("Database update result:", {
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount
    });

    // Send email notification
    console.info("=== EMAIL NOTIFICATION PROCESS ===");
    try {
      if (invoiceData) {

        const documentNumber = invoiceData.invoice?.clnumber || invoiceData.clnumber || 'Unknown';
        console.info("Generated document number:", documentNumber);

        // Prepare email data
        const emailData = {
          documentNumber: documentNumber,
          invoices: [
            {
              invoiceNumber: invoiceData.invoice?.invoiceno || invoiceData.invoiceno || 'Unknown',
              reason: rejectionReason || "No reason provided"
            }
          ]
        };
        console.info("Email data prepared:", emailData);

        // Generate email HTML content
        console.info("Generating email HTML content...");
        const emailHtml = generateRejectInvoiceEmail(emailData);
        console.info("Email HTML generated:", emailHtml ? "Success" : "Failed");

        if (emailHtml) {
          console.info("Email HTML content length:", emailHtml.length);
          console.info("First 200 chars of HTML:", emailHtml.substring(0, 200) + "...");
        }

        // Send email
        if (emailHtml) {
          console.info("Attempting to send email to: tiar.agisti@gmail.com");
          const emailResult = await sendEmail({
            to: "tiar.agisti@gmail.com", // Hardcoded email for now
            subject: `Invoice Rejected Notification - Doc ${documentNumber}`,
            html: emailHtml,
            text: `Invoice ${emailData.invoices[0].invoiceNumber} has been rejected. Reason: ${rejectionReason}`
          });
          console.info("Email send result:", emailResult);
          console.info(`✅ Reject notification email queued for Invoice: ${emailData.invoices[0].invoiceNumber}`);
        } else {
          console.info("❌ Email HTML is empty, email not sent");
        }
      } else {
        console.info("❌ No invoice data found, email not sent");
      }
    } catch (emailError) {
      console.error("❌ Error sending reject notification email:", emailError);
      console.error("Email error stack:", emailError.stack);
      // Don't fail the main operation if email fails
    }

    console.info("=== REJECT INVOICE PROCESS COMPLETED ===");
    console.info("Redirecting to /customer-document");
    return res.redirect("/customer-document");
  } catch (error) {
    console.error("❌ REJECT INVOICE ERROR:", error);
    console.error("Error stack:", error.stack);
    res.status(500).send("Server error");
  }
};

exports.exports = async (req, res) => {
  const { HOST } = process.env;
  const { reportType, queryString } = req.query;

  const params = new URLSearchParams(queryString);

  console.log("params", params);

  const searchParam = {};
  params.forEach((value, key) => {
    searchParam[key] = value;
  });

  let billings = [];

  const db = mongoose.connection;
  const collection = db.collection("billing");

  if (reportType === "CURRENT") {
    const query = buildBillingSearchQuery(searchParam);
    billings = await collection.find(query).toArray();
  } else {
    billings = await collection.find().toArray();
  }

  const epoch = new Date().getTime().toString();
  const fileName = `./exports/billing-${reportType.toLowerCase()}-${epoch}.csv`;
  let header = [
    { id: "accountID", title: "ACCOUNT ID" },
    { id: "customerName", title: "CUSTOMER NAME" },
    { id: "clNumber", title: "CL NUMBER" },
    { id: "clDate", title: "CL DATE" },
    { id: "invoiceNo", title: "INVOICE NO" },
    { id: "invoiceDate", title: "INVOICE DATE" },
    { id: "emailSent", title: "EMAIL SENT" },
    { id: "emailSendDate", title: "EMAIL SENDING DATE" },
    { id: "status", title: "STATUS" },
    { id: "excelSummaryInvoice", title: "EXCEL SUMMARY INVOICE" },
    { id: "rejectionReason", title: "REASON" },
  ];

  // if (searchParam.billingStatus === "REJECTED") {
  // header.push({ id: "rejectionReason", title: "REASON" });
  // }

  const csvWriter = createCsvWriter({
    path: fileName,
    header,
  });

  const flatData = billings.map((item) => ({
    accountID: item.accountID,
    customerName: item.invoice.cloCustName,
    clNumber: item.invoice.clnumber,
    clDate: moment(item.invoice.cldate).format("MM/DD/YYYY"),
    invoiceNo: item.invoice.invoiceno,
    invoiceDate: moment(item.invoice.invdate).format("MM/DD/YYYY"),
    emailSent: item.sentTo,
    emailSendDate: moment(item.emailSendDate).format("MM/DD/YYYY HH:mm"),
    status: getBillingStatus(item),
    excelSummaryInvoice: `${HOST}/uploads/${item.excelSummaryInvoice}`,
    rejectionReason: item.rejectionReason,
  }));

  csvWriter.writeRecords(flatData).then(() => {
    res.download(fileName);
  });
};

const buildBillingSearchQuery = (params) => {
  const {
    accountID,
    customerName,
    clNumber,
    invoiceNo,
    clDate,
    invoiceDate,
    emailSent,
    billingStatus,
    emailSentDate,
  } = params;

  const query = {};

  console.log(accountID, "accountID", typeof accountID);

  if (accountID && typeof accountID == "string") {
    const accountIDArray = accountID?.split(",")?.map((item) => {
      return { accountID: { $regex: item.trim(), $options: "i" } };
    });

    if (accountIDArray.length > 0) {
      query.$or = accountIDArray;
    }
  } else if (accountID && typeof accountID == "object") {
    query.$or = [{ accountID }];
  }

  if (customerName) {
    const customerNameArray = customerName?.split(",")?.map((item) => {
      return { cloCustName: { $regex: item.trim(), $options: "i" } };
    });

    if (customerNameArray.length > 0) {
      query.$or = customerNameArray;
    }
  }

  if (clNumber) {
    const itemsArray = clNumber?.split(",")?.map((item) => {
      return { clnumber: { $regex: item.trim(), $options: "i" } };
    });

    if (itemsArray.length > 0) {
      query.$or = itemsArray;
    }
  }

  if (invoiceNo) {
    const itemsArray = invoiceNo?.split(",")?.map((item) => {
      return { invoiceno: { $regex: item.trim(), $options: "i" } };
    });

    if (itemsArray.length > 0) {
      query.$or = itemsArray;
    }
  }

  if (clDate) {
    const [start, end] = clDate.split(" - ");
    const startDate = new Date(`${start}T00:00:00.000Z`);
    const endDate = new Date(`${end}T23:59:59.999Z`);
    query["invoice.cldate"] = {
      $gte: startDate,
      $lt: endDate,
    };
  }

  if (invoiceDate) {
    const [start, end] = invoiceDate.split(" - ");
    const startDate = new Date(`${start}T00:00:00.000Z`);
    const endDate = new Date(`${end}T23:59:59.999Z`);
    query["invoice.invdate"] = {
      $gte: startDate,
      $lt: endDate,
    };
  }

  if (emailSentDate) {
    const [start, end] = emailSentDate.split(" - ");
    const startDate = new Date(`${start}T00:00:00.000Z`);
    const endDate = new Date(`${end}T23:59:59.999Z`);
    query["emailSendDate"] = {
      $gte: startDate.toISOString(),
      $lt: endDate.toISOString(),
    };
  }

  if (emailSent) {
    const itemsArray = emailSent?.split(",")?.map((item) => {
      return { sentTo: { $regex: item.trim(), $options: "i" } };
    });

    if (itemsArray.length > 0) {
      query.$or = itemsArray;
    }
  }

  if (billingStatus) {
    if (billingStatus === "EMAIL_READ") {
      query["customerDownloadHistory"] = {
        $gt: [{ $size: "$customerDownloadHistory" }, 0],
      };
      query["$or"] = [
        { billingStatus: { $exists: false } }, // Kondisi ketika `billingStatus` tidak ada
        { billingStatus: { $ne: "PAID" } }, // Kondisi ketika `billingStatus` bukan "PAID"
      ];
    } else if (billingStatus === "UNPAID") {
      query["customerDownloadHistory"] = { $size: 0 };
      query["$or"] = [
        { billingStatus: { $exists: false } }, // Kondisi ketika `billingStatus` tidak ada
        { billingStatus: { $ne: "PAID" } }, // Kondisi ketika `billingStatus` bukan "PAID"
      ];
    } else if (billingStatus === "REJECTED") {
      query["isRejected"] = true;
    } else {
      query["billingStatus"] = billingStatus; // CANCELLED Situation handled on here
    }
  }

  console.log("query", query);

  return query;
};

const getBillingStatus = (item) => {
  let status = "";
  if (item.billingStatus === "PAID") {
    status = "PAID";
  } else if (item.billingStatus === "PARTIAL_PAID") {
    status = "PARTIAL PAID";
  } else if (item.customerDownloadHistory?.length > 0) {
    status = "EMAIL READ";
  } else {
    status = "EMAIL SENT";
  }

  console.log(item.billingStatus);
  if (item.billingStatus === "CANCELLED") {
    status += ", CANCELLED";
  } else if (item.isRejected) {
    status += ", REJECTED";
  }

  return status;
};

exports.exportsCustomerBilling = async (req, res) => {
  const { HOST } = process.env;
  const { reportType, queryString } = req.query;

  const params = new URLSearchParams(queryString);

  const searchParam = {};
  params.forEach((value, key) => {
    searchParam[key] = value;
  });

  // Filter by account id
  const clonedUser = JSON.parse(JSON.stringify(req.user));
  if (searchParam.accountID) {
    searchParam["accountID"] = { $eq: searchParam.accountID };
  } else {
    searchParam["accountID"] = { $in: clonedUser.accountID };
  }

  searchParam["billingStatus"] = { $ne: "CANCELLED" };

  let billings = [];

  const db = mongoose.connection;
  const collection = db.collection("billing");

  if (reportType === "CURRENT") {
    const query = buildBillingSearchQuery(searchParam);
    billings = await collection.find(query).toArray();
  } else {
    const filter = {
      billingStatus: { $ne: "CANCELLED" },
      accountID: { $in: clonedUser.accountID },
    };
    billings = await collection.find(filter).toArray();
  }

  const epoch = new Date().getTime().toString();
  const fileName = `./exports/user-billing-${reportType.toLowerCase()}-${epoch}.csv`;

  const csvWriter = createCsvWriter({
    path: fileName,
    header: [
      { id: "accountID", title: "ACCOUNT ID" },
      { id: "cloCustName", title: "CUSTOMER NAME" },
      { id: "clNumber", title: "CL NUMBER" },
      { id: "clDate", title: "CL DATE" },
      { id: "invoiceNo", title: "INVOICE NO" },
      { id: "invoiceDate", title: "INVOICE DATE" },
      { id: "downloadInvoice", title: "DOWNLOAD INVOICE" },
      { id: "emailSendDate", title: "EMAIL SEND DATE" },
      { id: "status", title: "STATUS" },
    ],
  });

  console.log(billings);

  const flatData = billings.map((item) => ({
    accountID: item.accountID,
    cloCustName: item.invoice.cloCustName,
    clNumber: item.invoice.clnumber,
    clDate: moment(item.invoice.cldate).format("MM/DD/YYYY"),
    invoiceNo: item.invoice.invoiceno,
    invoiceDate: moment(item.invoice.invdate).format("MM/DD/YYYY"),
    downloadInvoice: `${HOST}/api/invoices/download/${item._id.toString()}`,
    emailSendDate: item.emailSendDate
      ? moment(item.emailSendDate).format("MM/DD/YYYY HH:mm")
      : "-",
    status: getBillingStatus(item),
  }));

  csvWriter.writeRecords(flatData).then(() => {
    res.download(fileName);
  });
};
