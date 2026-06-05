const moment = require("moment");
const ObjectId = require("mongodb").ObjectId;
const mongoose = require("mongoose");
const { createQueryString } = require("../helpers/createQueryString");
const listFilesInDirectory = require("../helpers/listFilesInDirectory");
const ExcelJS = require('exceljs');
const sendEmail = require("../helpers/sendEmail");
const { generateRejectInvoiceEmail } = require("../helpers/generateRejectInvoiceEmail");

exports.fetch = async (req, res) => {
  try {
    let query = exports.buildBillingSearchQuery(req.query);

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
      if (typeof item.rejectionReason === "string") {
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
      clearSelected: Object.keys(req.query).length === 0,
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
      pic,
      clNumber,
      invoiceNo,
      clDate,
      invoiceDate,
      emailSent,
      emailSentDate,
      billingStatus,
      id,
      logId,
      page = 1,
      pageSize = 10,
    } = req.query;

    const skip = (page - 1) * pageSize;
    const limit = parseInt(pageSize);

    const query = {};
    const clonedUser = JSON.parse(JSON.stringify(req.user));

    // Handle accountID search with multiple values
    // For USER role, validate that they can only search their own accountIDs
    if (accountID) {
      const accountIDArray = accountID.split(",").map((item) => item.trim());
      
      // If USER role, intersect search accountIDs with user's assigned accountIDs
      if (req.user.role === 'USER' && clonedUser.accountID && Array.isArray(clonedUser.accountID)) {
        // Filter to only allow accountIDs that user has access to
        const allowedAccountIDs = accountIDArray.filter(searchId => 
          clonedUser.accountID.some(userAccountId => 
            userAccountId.toLowerCase() === searchId.toLowerCase()
          )
        );
        
        // If no valid accountIDs found, set impossible condition to return empty result
        if (allowedAccountIDs.length === 0) {
          query["accountID"] = { $in: [] }; // Will return no results
        } else if (allowedAccountIDs.length === 1) {
          query["accountID"] = { $regex: allowedAccountIDs[0], $options: "i" };
        } else {
          query["accountID"] = { 
            $in: allowedAccountIDs.map(item => new RegExp(item, "i"))
          };
        }
      } else {
        // For SUPER_ADMIN and ADMIN, allow any accountID search
        if (accountIDArray.length === 1) {
          query["accountID"] = { $regex: accountIDArray[0], $options: "i" };
        } else {
          query["accountID"] = { 
            $in: accountIDArray.map(item => new RegExp(item, "i"))
          };
        }
      }
    }

    // Handle customerName (not used in customer view but kept for consistency)
    if (customerName) {
      const customerNameArray = customerName.split(",").map((item) => item.trim());
      if (customerNameArray.length === 1) {
        query["cloCustName"] = { $regex: customerNameArray[0], $options: "i" };
      } else {
        query["cloCustName"] = {
          $in: customerNameArray.map(item => new RegExp(item, "i"))
        };
      }
    }

    // Handle PIC search with multiple values
    if (pic) {
      const picArray = pic.split(",").map((item) => item.trim());
      if (picArray.length === 1) {
        query["pic"] = { $regex: picArray[0], $options: "i" };
      } else {
        query["pic"] = {
          $in: picArray.map(item => new RegExp(item, "i"))
        };
      }
    }

    // Handle clNumber search with multiple values
    if (clNumber) {
      const clNumberArray = clNumber.split(",").map((item) => item.trim());
      if (clNumberArray.length === 1) {
        query["clnumber"] = { $regex: clNumberArray[0], $options: "i" };
      } else {
        query["clnumber"] = {
          $in: clNumberArray.map(item => new RegExp(item, "i"))
        };
      }
    }

    // Handle invoiceNo search with multiple values
    if (invoiceNo) {
      const invoiceNoArray = invoiceNo.split(",").map((item) => item.trim());
      if (invoiceNoArray.length === 1) {
        query["invoiceno"] = { $regex: invoiceNoArray[0], $options: "i" };
      } else {
        query["invoiceno"] = {
          $in: invoiceNoArray.map(item => new RegExp(item, "i"))
        };
      }
    }

    // Handle clDate range
    if (clDate) {
      const [start, end] = clDate.split(" - ");
      const startDate = new Date(`${start}T00:00:00.000Z`);
      const endDate = new Date(`${end}T23:59:59.999Z`);
      query["invoice.cldate"] = {
        $gte: startDate,
        $lt: endDate,
      };
    }

    // Handle invoiceDate range
    if (invoiceDate) {
      const [start, end] = invoiceDate.split(" - ");
      const startDate = new Date(`${start}T00:00:00.000Z`);
      const endDate = new Date(`${end}T23:59:59.999Z`);
      query["invoice.invdate"] = {
        $gte: startDate,
        $lt: endDate,
      };
    }

    // Handle emailSentDate range
    if (emailSentDate) {
      const [start, end] = emailSentDate.split(" - ");
      const startDate = new Date(`${start}T00:00:00.000Z`);
      const endDate = new Date(`${end}T23:59:59.999Z`);
      query["emailSendDate"] = {
        $gte: startDate.toISOString(),
        $lt: endDate.toISOString(),
      };
    }

    // Handle emailSent search with multiple values
    if (emailSent) {
      const emailSentArray = emailSent.split(",").map((item) => item.trim());
      if (emailSentArray.length === 1) {
        query["sentTo"] = { $regex: emailSentArray[0], $options: "i" };
      } else {
        query["sentTo"] = {
          $in: emailSentArray.map(item => new RegExp(item, "i"))
        };
      }
    }

    // Handle billing status
    if (billingStatus) {
      if (billingStatus === "EMAIL_READ") {
        query["customerDownloadHistory"] = {
          $gt: [{ $size: "$customerDownloadHistory" }, 0],
        };
        query["$or"] = [
          { billingStatus: { $exists: false } },
          { billingStatus: { $ne: "PAID" } },
        ];
      } else if (billingStatus === "UNPAID") {
        query["customerDownloadHistory"] = { $size: 0 };
        query["$or"] = [
          { billingStatus: { $exists: false } },
          { billingStatus: { $ne: "PAID" } },
        ];
      } else if (billingStatus === "REJECTED") {
        query["isRejected"] = true;
      } else {
        query["billingStatus"] = billingStatus;
      }
    }

    if (id) {
      query["_id"] = new ObjectId(id);
    }

    if (logId) {
      query["logId"] = new ObjectId(logId);
    }

    // Filter by account id - only apply for USER role
    // SUPER_ADMIN and ADMIN can see all data
    if (req.user.role === 'USER') {
      // If USER didn't search by accountID, restrict to their assigned accountIDs
      if (!req.query.accountID && clonedUser.accountID && Array.isArray(clonedUser.accountID)) {
        query["accountID"] = { $in: clonedUser.accountID };
      }
      // If USER searched by accountID, validation already handled above (line 87-115)
    }
    // For SUPER_ADMIN and ADMIN, no accountID restriction unless they explicitly search for it

    console.log("Final query for fetchCustomerBilling:", JSON.stringify(query, null, 2));
    console.log("User role:", req.user.role);
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
      clearSelected: Object.keys(req.query).length === 0,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
};

exports.attachFile = async (req, res) => {
  try {
    const { clNumber, uploadedFileName } = req.body;
    const normalizedClNumber = (clNumber || "").trim();

    const db = mongoose.connection;
    const collection = db.collection("billing");

    let summaryFile = null;

    if (uploadedFileName) {
      summaryFile = { name: uploadedFileName };
    } else {
      const files = await listFilesInDirectory("uploads");

      const filteredFiles = files
        .filter((file) => file.name.toLowerCase().includes(normalizedClNumber.toLowerCase()))
        .sort((a, b) => b.addedDate - a.addedDate);

      summaryFile = filteredFiles.length > 0 ? filteredFiles[0] : null;
    }

    if (summaryFile) {
      const result = await collection.updateMany(
        { clnumber: normalizedClNumber },
        { $set: { excelSummaryInvoice: summaryFile.name } }
      );

      console.log(
        "Matched:",
        result.matchedCount,
        "Modified:",
        result.modifiedCount
      );

      if (result.matchedCount === 0) {
        console.warn(`No documents found with clnumber: ${normalizedClNumber}`);
      }
    } else {
      console.warn(`No file found for clNumber: ${normalizedClNumber}`);
    }

    return res.redirect("/billing");
  } catch (error) {
    console.error("Error in attachFile:", error);
    return res.redirect("/billing");
  }
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

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      console.error("❌ Invalid or missing id:", id);
      return res.status(400).send("Invalid or missing invoice id");
    }

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

    const newEntry = {
      reason: rejectionReason.trim(),
      date: new Date().toISOString(),
      pic: req.user.email
    };

    let updatedRejectionReason;
    if (typeof invoiceData.rejectionReason === 'string' && invoiceData.rejectionReason) {
      updatedRejectionReason = [
        { reason: invoiceData.rejectionReason, date: invoiceData.rejectedOn || null, pic: null },
        newEntry
      ];
    } else if (Array.isArray(invoiceData.rejectionReason)) {
      updatedRejectionReason = [...invoiceData.rejectionReason, newEntry];
    } else {
      updatedRejectionReason = [newEntry];
    }

    const updateResult = await collection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          isRejected: true,
          rejectionReason: updatedRejectionReason,
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
    const sendRejectNotificationEmail = require("../helpers/sendRejectNotificationEmail");
    await sendRejectNotificationEmail(db, invoiceData, {
      type: "REJECT",
      info: "direjected by customer",
      reason: rejectionReason,
      rejectedBy: req.user?.email || ""
    });

    console.info("=== REJECT INVOICE PROCESS COMPLETED ===");
    console.info("Redirecting to /customer-document");
    return res.redirect("/customer-document");
  } catch (error) {
    console.error("❌ REJECT INVOICE ERROR:", error);
    console.error("Error stack:", error.stack);
    console.error("Request body:", JSON.stringify(req.body, null, 2));
    res.status(500).send("Server error");
  }
};

exports.cancelReject = async (req, res) => {
  console.info("=== CANCEL REJECT PROCESS STARTED ===");
  try {
    const { reason, id } = req.body;
    console.info("Request data received:", { reason, id });

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      console.error("❌ Invalid or missing id:", id);
      return res.status(400).send("Invalid or missing invoice id");
    }

    const db = mongoose.connection;
    const collection = db.collection("billing");
    console.info("Database connection established");

    // Get invoice data before updating
    const invoiceData = await collection.findOne({ _id: new ObjectId(id) });
    console.info("Invoice data found:", invoiceData ? "Yes" : "No");

    if (!invoiceData) {
      console.error("❌ Invoice not found with id:", id);
      return res.status(404).send("Invoice not found");
    }

    // Check if it's currently rejected
    if (!invoiceData.isRejected) {
      console.error("❌ Invoice is not currently rejected:", id);
      return res.status(400).send("Invoice is not rejected");
    }

    // Prepare cancel reject reason with timestamp
    const cancelRejectEntry = {
      reason: reason.trim(),
      date: new Date().toISOString(),
      pic: req.user.email
    };

    const updateResult = await collection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          isRejected: false,
          modifiedOn: new Date().toISOString(),
        },
        $push: {
          cancelRejectReasons: cancelRejectEntry
        }
      }
    );

    console.info("Database update result:", {
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount
    });

    try {
      const sendRejectNotificationEmail = require("../helpers/sendRejectNotificationEmail");
      await sendRejectNotificationEmail(db, invoiceData, {
        type: "CANCEL_REJECT",
        info: "di cancel reject",
        reason: reason,
        customToEmails: invoiceData.sentTo
      });
    } catch (emailError) {
      console.error("❌ Error sending reject notification email:", emailError);
      console.error("Email error stack:", emailError.stack);
      // Don't fail the main operation if email fails
    }

    console.info("=== CANCEL REJECT PROCESS COMPLETED ===");

    // Determine redirect based on referrer or default to customer-document
    const referer = req.get('Referer');
    if (referer && referer.includes('/billing?')) {
      console.info("Redirecting to /billing");
      return res.redirect("/billing");
    } else {
      console.info("Redirecting to /customer-document");
      return res.redirect("/customer-document");
    }
  } catch (error) {
    console.error("❌ CANCEL REJECT ERROR:", error);
    console.error("Error stack:", error.stack);
    console.error("Request body:", JSON.stringify(req.body, null, 2));
    res.status(500).send("Server error");
  }
};

exports.rejectInvoiceByAdmin = async (req, res) => {
  console.info("=== ADMIN REJECT INVOICE PROCESS STARTED ===");
  try {
    const { rejectionReason, id } = req.body;
    console.info("Request data received:", { rejectionReason, id });

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      console.error("❌ Invalid or missing id:", id);
      return res.status(400).send("Invalid or missing invoice id");
    }

    const db = mongoose.connection;
    const collection = db.collection("billing");
    console.info("Database connection established");

    // Get invoice data before updating
    const invoiceData = await collection.findOne({ _id: new ObjectId(id) });
    console.info("Invoice data found:", invoiceData ? "Yes" : "No");

    if (!invoiceData) {
      console.error("❌ Invoice not found with id:", id);
      return res.status(404).send("Invoice not found");
    }

    // Validate: cannot reject if already CANCELLED, PAID, or already rejected
    if (invoiceData.billingStatus === 'CANCELLED') {
      console.error("❌ Invoice is already cancelled:", id);
      return res.status(400).send("Cannot reject cancelled invoice");
    }

    if (invoiceData.billingStatus === 'PAID') {
      console.error("❌ Invoice is already paid:", id);
      return res.status(400).send("Cannot reject paid invoice");
    }

    if (invoiceData.isRejected) {
      console.error("❌ Invoice is already rejected:", id);
      return res.status(400).send("Invoice is already rejected");
    }

    console.info("Invoice validation passed");

    // Prepare rejection entry with timestamp and admin email
    const newEntry = {
      reason: rejectionReason.trim(),
      date: new Date().toISOString(),
      pic: req.user.email
    };

    // Handle rejectionReason field - maintain array structure or convert to array
    let updatedRejectionReason;
    if (typeof invoiceData.rejectionReason === 'string' && invoiceData.rejectionReason) {
      updatedRejectionReason = [
        { reason: invoiceData.rejectionReason, date: invoiceData.rejectedOn || null, pic: null },
        newEntry
      ];
    } else if (Array.isArray(invoiceData.rejectionReason)) {
      updatedRejectionReason = [...invoiceData.rejectionReason, newEntry];
    } else {
      updatedRejectionReason = [newEntry];
    }

    const updateResult = await collection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          isRejected: true,
          rejectionReason: updatedRejectionReason,
          rejectedOn: new Date().toISOString(),
          modifiedOn: new Date().toISOString(),
        },
      }
    );

    console.info("Database update result:", {
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount
    });

     console.info("=== EMAIL NOTIFICATION PROCESS ===");
    try {
      const sendRejectNotificationEmail = require("../helpers/sendRejectNotificationEmail");
      await sendRejectNotificationEmail(db, invoiceData, {
        type: "REJECT",
        info: "direjected by admin",
        reason: rejectionReason,
        rejectedBy: req.user?.email || ""
      });
    } catch (emailError) {
      console.error("❌ Error sending reject notification email:", emailError);
      console.error("Email error stack:", emailError.stack);
      // Don't fail the main operation if email fails
    }

    console.info("=== ADMIN REJECT INVOICE PROCESS COMPLETED ===");

    return res.redirect("/billing");
  } catch (error) {
    console.error("❌ ADMIN REJECT INVOICE ERROR:", error);
    console.error("Error stack:", error.stack);
    console.error("Request body:", JSON.stringify(req.body, null, 2));
    res.status(500).send("Server error");
  }
};

exports.exports = async (req, res) => {
  try {
    const { HOST } = process.env;
    const { reportType, queryString, selectedIds } = req.body;

    const params = new URLSearchParams(queryString);

    const searchParam = {};
    params.forEach((value, key) => {
      searchParam[key] = value;
    });

    let billings = [];
    const ENTIRE_EXPORT_LIMIT = 5000;

    const db = mongoose.connection;
    const collection = db.collection("billing");

    // Handle MULTIPLE_INVOICE variants - download PDFs instead of CSV
    if (reportType === "MULTIPLE_INVOICE" || reportType === "MULTIPLE_INVOICE_STAMPED") {
      if (!selectedIds) {
        return res.status(400).json({ error: "selectedIds is required for MULTIPLE_INVOICE/MULTIPLE_INVOICE_STAMPED" });
      }

      const ids = selectedIds.split(",").map((id) => id.trim());
      const isStamped = reportType === "MULTIPLE_INVOICE_STAMPED";

      // Render view for multiple invoice downloads
      return res.render('downloadMultipleInvoices', { ids, isStamped });
    }

    if (reportType === "CURRENT") {
      const page = Math.max(parseInt(searchParam.page, 10) || 1, 1);
      const parsedPageSize = parseInt(searchParam.pageSize, 10);
      const pageSize = Number.isNaN(parsedPageSize)
        ? 10
        : Math.min(Math.max(parsedPageSize, 1), 500);
      const skip = (page - 1) * pageSize;

      delete searchParam.page;
      delete searchParam.pageSize;

      const query = exports.buildBillingSearchQuery(searchParam);
      billings = await collection.find(query).skip(skip).limit(pageSize).toArray();
    } else if (reportType === "MULTIPLE_ROW") {
      if (!selectedIds) {
        return res.status(400).json({ error: "selectedIds is required for MULTIPLE_ROW" });
      }

      // Validate and convert IDs, skip invalid ones
      const idStrings = selectedIds.split(",").map((id) => id.trim()).filter(id => id);
      const validIds = [];
      const invalidIds = [];
      
      for (const idStr of idStrings) {
        try {
          if (mongoose.Types.ObjectId.isValid(idStr)) {
            validIds.push(new mongoose.Types.ObjectId(idStr));
          } else {
            invalidIds.push(idStr);
          }
        } catch (e) {
          invalidIds.push(idStr);
        }
      }
      
      if (invalidIds.length > 0) {
        console.warn('Invalid ObjectIds found and skipped:', invalidIds);
      }
      
      if (validIds.length === 0) {
        return res.status(400).json({ error: "No valid IDs provided" });
      }
      
      billings = await collection.find({ _id: { $in: validIds } }).toArray();
    } else {
      const totalRows = await collection.estimatedDocumentCount();
      if (totalRows > ENTIRE_EXPORT_LIMIT) {
        return res.status(400).json({
          error: `ENTIRE export is limited to ${ENTIRE_EXPORT_LIMIT} rows`,
          totalRows,
          limit: ENTIRE_EXPORT_LIMIT,
          suggestion: "Please refine your filter or use CURRENT/MULTIPLE_ROW export",
        });
      }

      billings = await collection.find().limit(ENTIRE_EXPORT_LIMIT).toArray();
    }

    const epoch = new Date().getTime().toString();
    const fileName = `billing-${reportType.toLowerCase()}-${epoch}.xlsx`;
  
  // Create workbook and worksheet
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Billing Data');

  // Define columns
  worksheet.columns = [
    { header: 'ACCOUNT ID', key: 'accountID', width: 15 },
    { header: 'CUSTOMER NAME', key: 'customerName', width: 30 },
    { header: 'CL NUMBER', key: 'clNumber', width: 15 },
    { header: 'CL DATE', key: 'clDate', width: 12 },
    { header: 'INVOICE NO', key: 'invoiceNo', width: 15 },
    { header: 'INVOICE DATE', key: 'invoiceDate', width: 12 },
    { header: 'EMAIL SENT', key: 'emailSent', width: 30 },
    { header: 'EMAIL SENDING DATE', key: 'emailSendDate', width: 20 },
    { header: 'STATUS', key: 'status', width: 20 },
    { header: 'EXCEL SUMMARY INVOICE', key: 'excelSummaryInvoice', width: 50 },
    { header: 'REASON REJECT', key: 'rejectionReason', width:  100},
    { header: 'PIC REJECT', key: 'picReject', width: 30 },
    { header: 'REJECT DATE', key: 'rejectionDates', width: 30 },
    { header: 'REASON CANCEL REJECT', key: 'cancelRejectReason', width:  100},
    { header: 'PIC CANCEL REJECT', key: 'picCancelReject', width: 30 },
    { header: 'CANCEL REJECT DATE', key: 'cancelRejectDates', width: 30 },
  ];

  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD3D3D3' }
  };

  const flatData = billings.map((item) => {
    try {
       let rejectionReason = '';
      let picReject = '';
      let rejectionDates = '';
      const rejectionEntries = Array.isArray(item.rejectionReason) ? item.rejectionReason : [];

      if (rejectionEntries.length > 0) {
        let num = 1;
        rejectionEntries.forEach(reason => {
          rejectionReason += `${num}. ${reason.reason}\n`;
          picReject += `${num}. ${reason.pic || '-'}\n`;
          rejectionDates += `${num}. ${moment(reason.date).format("MM/DD/YYYY")}\n`;

          num++;
        })
      }

      let cancelRejectReason = '';
      let picCancelReject = '';
      let cancelRejectDates = '';
      const cancelRejectEntries = Array.isArray(item.cancelRejectReasons)
        ? item.cancelRejectReasons
        : [];

      if (cancelRejectEntries.length > 0) {
        let num = 1;
        cancelRejectEntries.forEach(reason => {
          cancelRejectReason += `${num}. ${reason.reason}\n`;
          picCancelReject += `${num}. ${reason.pic || '-'}\n`;
          cancelRejectDates += `${num}. ${moment(reason.date).format("MM/DD/YYYY")}\n`;

          num++;
        })
      }

      return {
        accountID: item.accountID || '',
        customerName: item.invoice?.cloCustName || '',
        clNumber: item.invoice?.clnumber || '',
        clDate: item.invoice?.cldate ? moment(item.invoice.cldate).format("MM/DD/YYYY") : '',
        invoiceNo: item.invoice?.invoiceno || '',
        invoiceDate: item.invoice?.invdate ? moment(item.invoice.invdate).format("MM/DD/YYYY") : '',
        emailSent: item.sentTo || '',
        emailSendDate: item.emailSendDate ? moment(item.emailSendDate).format("MM/DD/YYYY HH:mm") : '',
        status: getBillingStatus(item),
        excelSummaryInvoice: item.excelSummaryInvoice ? `${HOST}/uploads/${item.excelSummaryInvoice}` : '',
        rejectionReason,
        picReject,
        rejectionDates,
        cancelRejectReason,
        picCancelReject,
        cancelRejectDates,
      };
    } catch (error) {
      console.error('Error processing billing item:', item._id, error);
      return {
        accountID: item.accountID || '',
        customerName: 'Error',
        clNumber: '',
        clDate: '',
        invoiceNo: '',
        invoiceDate: '',
        emailSent: '',
        emailSendDate: '',
        status: 'Error',
        excelSummaryInvoice: '',
        rejectionReason: 'Error processing this row',
        picReject: 'Error',
        rejectionDates: 'Error',
        cancelRejectReason: 'Error',
        picCancelReject: 'Error',
        cancelRejectDates: 'Error',
      };
    }
  });

  // Add rows
  worksheet.addRows(flatData);

  // Write to buffer and stream to response (no file system required)
  const buffer = await workbook.xlsx.writeBuffer();
  
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', buffer.length);
  
  res.send(buffer);
  } catch (error) {
    console.error('Error in exports():', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ error: 'Failed to generate export file', message: error.message });
  }
};

exports.buildBillingSearchQuery = (params) => {
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
    // Check if invoiceDate is a range (contains " - ") or single date
    if (invoiceDate.includes(" - ")) {
      // Handle range format: "2024-01-01 - 2024-01-31"
      const [start, end] = invoiceDate.split(" - ");
      const startDate = new Date(`${start}T00:00:00.000Z`);
      const endDate = new Date(`${end}T23:59:59.999Z`);
      query["invoice.invdate"] = {
        $gte: startDate,
        $lt: endDate,
      };
    } else {
      // Handle single date format: "2024-01-01"
      const startDate = new Date(`${invoiceDate}T00:00:00.000Z`);
      const endDate = new Date(`${invoiceDate}T23:59:59.999Z`);
      query["invoice.invdate"] = {
        $gte: startDate,
        $lt: endDate,
      };
    }
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
  try {
    const { HOST } = process.env;
    const { reportType, queryString, selectedIds } = req.body;

    const params = new URLSearchParams(queryString);

    const searchParam = {};
    params.forEach((value, key) => {
      searchParam[key] = value;
    });

    // Filter by account id
    const clonedUser = JSON.parse(JSON.stringify(req.user));
    
    let billings = [];
    const ENTIRE_EXPORT_LIMIT = 5000;

    const db = mongoose.connection;
    const collection = db.collection("billing");

    // Handle MULTIPLE_INVOICE variants - download PDFs instead of CSV
    if (reportType === "MULTIPLE_INVOICE" || reportType === "MULTIPLE_INVOICE_STAMPED") {
      if (!selectedIds) {
        return res.status(400).json({ error: "selectedIds is required for MULTIPLE_INVOICE/MULTIPLE_INVOICE_STAMPED" });
      }

      const ids = selectedIds.split(",").map((id) => id.trim());
      const isStamped = reportType === "MULTIPLE_INVOICE_STAMPED";

      // Render view for multiple invoice downloads
      return res.render('downloadMultipleInvoices', { ids, isStamped });
    }

    if (reportType === "CURRENT") {
      const page = Math.max(parseInt(searchParam.page, 10) || 1, 1);
      const parsedPageSize = parseInt(searchParam.pageSize, 10);
      const pageSize = Number.isNaN(parsedPageSize)
        ? 10
        : Math.min(Math.max(parsedPageSize, 1), 500);
      const skip = (page - 1) * pageSize;

      delete searchParam.page;
      delete searchParam.pageSize;

      const query = exports.buildBillingSearchQuery(searchParam);
      
      // Add account filter for non-superadmin users
      if (req.user.role === 'USER' && clonedUser.accountID && Array.isArray(clonedUser.accountID)) {
        query["accountID"] = { $in: clonedUser.accountID };
      }
      
      query["billingStatus"] = { $ne: "CANCELLED" };
      billings = await collection.find(query).skip(skip).limit(pageSize).toArray();
    } else if (reportType === "MULTIPLE_ROW") {
      if (!selectedIds) {
        return res.status(400).json({ error: "selectedIds is required for MULTIPLE_ROW" });
      }

      // Validate and convert IDs, skip invalid ones
      const idStrings = selectedIds.split(",").map((id) => id.trim()).filter(id => id);
      const validIds = [];
      const invalidIds = [];
      
      for (const idStr of idStrings) {
        try {
          if (mongoose.Types.ObjectId.isValid(idStr)) {
            validIds.push(new mongoose.Types.ObjectId(idStr));
          } else {
            invalidIds.push(idStr);
          }
        } catch (e) {
          invalidIds.push(idStr);
        }
      }
      
      if (invalidIds.length > 0) {
        console.warn('Invalid ObjectIds found and skipped:', invalidIds);
      }
      
      if (validIds.length === 0) {
        return res.status(400).json({ error: "No valid IDs provided" });
      }
      
      const query = { _id: { $in: validIds } };
      
      // Add account filter for non-superadmin users
      if (req.user.role === 'USER' && clonedUser.accountID && Array.isArray(clonedUser.accountID)) {
        query["accountID"] = { $in: clonedUser.accountID };
      }
      
      billings = await collection.find(query).toArray();
    } else {
      const filter = {
        billingStatus: { $ne: "CANCELLED" }
      };
      
      // Add account filter for non-superadmin users
      if (req.user.role === 'USER' && clonedUser.accountID && Array.isArray(clonedUser.accountID)) {
        filter["accountID"] = { $in: clonedUser.accountID };
      }

      const totalRows = await collection.countDocuments(filter);
      if (totalRows > ENTIRE_EXPORT_LIMIT) {
        return res.status(400).json({
          error: `ENTIRE export is limited to ${ENTIRE_EXPORT_LIMIT} rows`,
          totalRows,
          limit: ENTIRE_EXPORT_LIMIT,
          suggestion: "Please refine your filter or use CURRENT/MULTIPLE_ROW export",
        });
      }
      
      billings = await collection.find(filter).limit(ENTIRE_EXPORT_LIMIT).toArray();
    }

    const epoch = new Date().getTime().toString();
    const fileName = `user-billing-${reportType.toLowerCase()}-${epoch}.xlsx`;

  // Create workbook and worksheet
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Customer Billing');

  // Define columns
  worksheet.columns = [
    { header: 'ACCOUNT ID', key: 'accountID', width: 15 },
    { header: 'CUSTOMER NAME', key: 'cloCustName', width: 30 },
    { header: 'CL NUMBER', key: 'clNumber', width: 15 },
    { header: 'CL DATE', key: 'clDate', width: 12 },
    { header: 'INVOICE NO', key: 'invoiceNo', width: 15 },
    { header: 'INVOICE DATE', key: 'invoiceDate', width: 12 },
    { header: 'DOWNLOAD INVOICE', key: 'downloadInvoice', width: 50 },
    { header: 'DOWNLOAD  INVOICE STAMPED', key: 'downloadInvoiceStamped', width: 50 },
    { header: 'EMAIL SEND DATE', key: 'emailSendDate', width: 20 },
    { header: 'STATUS', key: 'status', width: 20 },
    { header: 'REASON REJECT', key: 'rejectionReason', width:  100},
    { header: 'PIC REJECT', key: 'picReject', width: 30 },
    { header: 'REJECT DATE', key: 'rejectionDates', width: 30 },
    { header: 'REASON CANCEL REJECT', key: 'cancelRejectReason', width:  100},
    { header: 'PIC CANCEL REJECT', key: 'picCancelReject', width: 30 },
    { header: 'CANCEL REJECT DATE', key: 'cancelRejectDates', width: 30 },
  ];

  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD3D3D3' }
  };

  const flatData = billings.map((item) => {
    try {
      let rejectionReason = '';
      let picReject = '';
      let rejectionDates = '';
      const rejectionEntries = Array.isArray(item.rejectionReason) ? item.rejectionReason : [];

      if (rejectionEntries.length > 0) {
        let num = 1;
        rejectionEntries.forEach(reason => {
          rejectionReason += `${num}. ${reason.reason}\n`;
          picReject += `${num}. ${reason.pic || '-'}\n`;
          rejectionDates += `${num}. ${moment(reason.date).format("MM/DD/YYYY")}\n`;

          num++;
        })
      }

      let cancelRejectReason = '';
      let picCancelReject = '';
      let cancelRejectDates = '';
      const cancelRejectEntries = Array.isArray(item.cancelRejectReasons)
        ? item.cancelRejectReasons
        : [];

      if (cancelRejectEntries.length > 0) {
        let num = 1;
        cancelRejectEntries.forEach(reason => {
          cancelRejectReason += `${num}. ${reason.reason}\n`;
          picCancelReject += `${num}. ${reason.pic || '-'}\n`;
          cancelRejectDates += `${num}. ${moment(reason.date).format("MM/DD/YYYY")}\n`;

          num++;
        })
      }

      return {
        accountID: item.accountID || '',
        cloCustName: item.invoice?.cloCustName || '',
        clNumber: item.invoice?.clnumber || '',
        clDate: item.invoice?.cldate ? moment(item.invoice.cldate).format("MM/DD/YYYY") : '',
        invoiceNo: item.invoice?.invoiceno || '',
        invoiceDate: item.invoice?.invdate ? moment(item.invoice.invdate).format("MM/DD/YYYY") : '',
        downloadInvoice: `${HOST}/api/invoices/download/${item._id.toString()}`,
        downloadInvoiceStamped: `${HOST}/api/invoices/download-stamped/${item._id.toString()}`,
        emailSendDate: item.emailSendDate ? moment(item.emailSendDate).format("MM/DD/YYYY HH:mm") : "-",
        status: getBillingStatus(item),
        rejectionReason,
        picReject,
        rejectionDates,
        cancelRejectReason,
        picCancelReject,
        cancelRejectDates,
      };
      
    } catch (error) {
      console.error('Error processing billing item:', item._id, error);
      return {
        accountID: item.accountID || '',
        cloCustName: 'Error',
        clNumber: '',
        clDate: '',
        invoiceNo: '',
        invoiceDate: '',
        downloadInvoice: '',
        emailSendDate: '-',
        status: 'Error',
        rejectionReason: 'Error processing this row',
        picReject: 'Error',
        rejectionDates: 'Error',
        cancelRejectReason: 'Error',
        picCancelReject: 'Error',
        cancelRejectDates: 'Error',
      };
    }
  });

  // Add rows
  worksheet.addRows(flatData);

  // Write to buffer and stream to response (no file system required)
  const buffer = await workbook.xlsx.writeBuffer();
  
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', buffer.length);
  
  res.send(buffer);
  } catch (error) {
    console.error('Error in exportsCustomerBilling():', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ error: 'Failed to generate export file', message: error.message });
  }
};

