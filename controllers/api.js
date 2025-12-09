const fs = require('fs');
const util = require('util');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');
const moment = require('moment-timezone');
const sendInvoiceRPA = require('../helpers/sendInvoiceRPA');
const Billing = require('../models/Billing');
const { ROLES } = require('../constants');
const extractEmails = require('../helpers/extractEmails');
const lookUpRPA = require('../helpers/logRPA/lookUpRPA');
const ObjectId = require('mongodb').ObjectId;

const readFile = util.promisify(fs.readFile);

exports.sendInvoiceEmail = async (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.info(`[${requestId}] Starting sendInvoiceEmail process`);

  try {
    const { clNumber, subject, invoiceNo, ignoreEmail, isResend } = req.body;
    const cc = req?.body?.cc || null;

    console.info(`[${requestId}] Request payload:`, {
      clNumber,
      subject,
      invoiceNo: Array.isArray(invoiceNo) ? invoiceNo.length : invoiceNo,
      ignoreEmail,
      isResend,
      cc
    });

    // Bug Fix #1: Validate clNumber
    if (!clNumber) {
      console.error(`[${requestId}] Missing clNumber in request`);
      return res.status(400).json({ message: 'Please provide clNumber data' });
    }

    // Bug Fix #2: Better invoiceNo validation
    if (!invoiceNo || (Array.isArray(invoiceNo) && invoiceNo.length === 0) ||
      (!Array.isArray(invoiceNo) && !invoiceNo)) {
      console.error(`[${requestId}] Invalid invoiceNo:`, invoiceNo);
      return res.status(400).json({ message: 'Please provide valid invoiceNo data' });
    }

    console.info(`[${requestId}] Connecting to database...`);
    const db = mongoose.connection;
    const rpa = db.collection('logRPA');

    console.info(`[${requestId}] Checking existing RPA logs for clNumber: ${clNumber}`);
    const checkRPA = await rpa
      .find({
        clNumber,
      })
      .toArray();

    console.info(`[${requestId}] Found ${checkRPA?.length || 0} existing RPA logs`);

    // Check RPA from RPA Server if not found
    if (!checkRPA || checkRPA?.length === 0) {
      console.warn(`[${requestId}] No RPA logs found, looking up from RPA server...`);
      try {
        await lookUpRPA(clNumber, invoiceNo);
        console.info(`[${requestId}] RPA lookup completed successfully`);
      } catch (lookupError) {
        console.error(`[${requestId}] RPA lookup failed:`, lookupError);
        // Continue execution - this might not be fatal
      }
    }

    console.info(`[${requestId}] Fetching RPA logs after lookup...`);
    let logsResult = await rpa
      .find({
        clNumber,
        // statuses: { $nin: ['ARCHIVE HC', 'EMAIL NOT FOUND'] },
      })
      .toArray();

    console.info(`[${requestId}] Retrieved ${logsResult?.length || 0} RPA logs`);

    if (!logsResult || logsResult?.length === 0) {
      console.error(`[${requestId}] No logs found for clNumber: ${clNumber}`);
      return res.status(400).json({
        message: "Invoice not found or Some customers on this cover list don't have an email.",
      });
    }

    // Bug Fix #3: Validate logs structure
    const logs = logsResult[0];
    if (!logs || !logs.invoiceDetail) {
      console.error(`[${requestId}] Invalid log structure:`, logs);
      return res.status(400).json({
        message: "Invalid invoice data structure",
      });
    }

    console.info(`[${requestId}] Processing logs for email extraction...`);
    // Collect all logs that doesnt have a emailSendDate
    const logsCustomerEmails = await rpa
      .find({
        clNumber,
        // statuses: { $nin: ['ARCHIVE HC', 'EMAIL NOT FOUND'] },
        // emailSendDate: { $exists: false }
      })
      .toArray();

    console.info(`[${requestId}] Found ${logsCustomerEmails?.length || 0} customer email logs`);

    // Collect all target emails
    const targetEmails = [];
    let instansi = '';
    let emailExtractionLog = [];

    for (let i = 0; i < logsCustomerEmails.length; i++) {
      const logEntry = logsCustomerEmails[i];

      // Bug Fix #4: Validate log entry structure
      if (!logEntry || !logEntry.invoiceDetail) {
        console.warn(`[${requestId}] Invalid log entry at index ${i}:`, logEntry);
        continue;
      }

      const { invoiceDetail } = logEntry;
      const { addrEmail, cloCustName } = invoiceDetail;

      instansi = cloCustName || instansi; // Keep last valid instansi

      if (addrEmail && addrEmail.includes('@')) {
        console.info(`[${requestId}] Extracting emails from: ${addrEmail}`);
        try {
          const logEmails = extractEmails(addrEmail);
          emailExtractionLog.push({
            index: i,
            addrEmail,
            extractedEmails: logEmails
          });

          logEmails.forEach((email) => {
            if (!targetEmails.includes(email)) {
              targetEmails.push(email);
            }
          });
        } catch (emailError) {
          console.error(`[${requestId}] Email extraction failed for ${addrEmail}:`, emailError);
        }
      } else {
        console.warn(`[${requestId}] No valid email found in addrEmail: ${addrEmail}`);
      }
    }

    console.info(`[${requestId}] Email extraction summary:`, {
      totalLogs: logsCustomerEmails.length,
      targetEmails: targetEmails,
      instansi,
      emailExtractionLog
    });

    if (targetEmails.length === 0) {
      console.warn(`[${requestId}] No target emails found, inserting billing without email...`);

      if (logsResult.length > 0) {
        console.info(`[${requestId}] Inserting ${logsResult.length} billing entries without email...`);

        for (const billingCandidate of logsResult) {
          try {
            await Billing.insertBilling(null, billingCandidate, null, cc);
            console.info(`[${requestId}] Billing inserted for invoice: ${billingCandidate?.invoiceDetail?.invoiceno}`);
          } catch (billingError) {
            console.error(`[${requestId}] Billing insertion failed:`, billingError);
          }
        }

        return res.json({
          message: 'Invoices have been inserted into billing!',
        });
      }

      console.info(`[${requestId}] No logs to process, returning processing message`);
      return res.json({ message: 'Email is being processed!' });
    }

    const mainEmail = targetEmails.join(',');
    console.info(`[${requestId}] Main email string: ${mainEmail}`);

    // Bug Fix #5: Better user lookup with error handling
    console.info(`[${requestId}] Looking up user for email: ${targetEmails[0]}`);
    const users = await User.find({ email: targetEmails[0] });
    console.info(`[${requestId}] Found ${users?.length || 0} users`);

    // Bug Fix #6: Validate user exists before proceeding
    if (!users || users.length === 0) {
      console.warn(`[${requestId}] No user found for email: ${targetEmails[0]}`);
      // Continue with null user - this might be acceptable in some cases
    }

    // Collect all invoice no
    console.info(`[${requestId}] Processing unique invoices...`);
    const uniqueInvoices = new Set();
    const invoiceProcessingLog = [];

    logs.invoiceDetail.invoiceNoAll = logsResult
      .filter((it) => {
        // Bug Fix #7: Validate invoice structure before processing
        if (!it || !it.invoiceDetail || !it.invoiceDetail.invoiceno) {
          console.warn(`[${requestId}] Invalid invoice entry:`, it);
          return false;
        }

        const invoiceNo = it.invoiceDetail.invoiceno;
        if (uniqueInvoices.has(invoiceNo)) {
          invoiceProcessingLog.push({ invoiceNo, action: 'duplicate_skipped' });
          return false; // Abaikan jika sudah ada
        }
        uniqueInvoices.add(invoiceNo); // Tambahkan ke Set
        invoiceProcessingLog.push({ invoiceNo, action: 'included' });
        return true; // Masukkan ke hasil filter
      })
      .map((it) => `<li>${it.invoiceDetail.invoiceno}</li>`)
      .join('');

    console.info(`[${requestId}] Invoice processing summary:`, {
      totalInvoices: logsResult.length,
      uniqueInvoices: uniqueInvoices.size,
      processingLog: invoiceProcessingLog
    });

    let taskId = null;

    if (!ignoreEmail) {
      console.info(`[${requestId}] Sending invoice email...`);
      try {
        taskId = await sendInvoiceRPA(
          users[0] || null, // Bug Fix #8: Handle null user gracefully
          logs.invoiceDetail,
          mainEmail,
          cc,
          instansi
        );
        console.info(`[${requestId}] Email task created with ID: ${taskId}`);
      } catch (emailError) {
        console.error(`[${requestId}] Email sending failed:`, emailError);
        // Don't return here - continue with database updates
      }
    } else {
      console.info(`[${requestId}] Email sending ignored as requested`);
    }

    console.info(`[${requestId}] Updating RPA logs with email send information...`);
    try {
      const updateResult = await rpa.updateMany(
        {
          clNumber,
          // statuses: { $nin: ['ARCHIVE HC', 'EMAIL NOT FOUND'] },
        },
        {
          $set: {
            sentTo: targetEmails,
            cc,
            emailSendDate: moment()
              .tz('Asia/Jakarta')
              .format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
            modifiedOn: new Date().toISOString(),
          },
        }
      );
      console.info(`[${requestId}] RPA logs update result:`, {
        matchedCount: updateResult.matchedCount,
        modifiedCount: updateResult.modifiedCount
      });
    } catch (updateError) {
      console.error(`[${requestId}] RPA logs update failed:`, updateError);
    }

    // Insert billing
    console.info(`[${requestId}] Inserting billing entries...`);
    const billingInsertionResults = [];

    for (const billingCandidate of logsResult) {
      try {
        await Billing.insertBilling(users, billingCandidate, targetEmails, cc);
        billingInsertionResults.push({
          invoiceNo: billingCandidate?.invoiceDetail?.invoiceno,
          status: 'success'
        });
        console.info(`[${requestId}] Billing inserted successfully for: ${billingCandidate?.invoiceDetail?.invoiceno}`);
      } catch (billingError) {
        billingInsertionResults.push({
          invoiceNo: billingCandidate?.invoiceDetail?.invoiceno,
          status: 'failed',
          error: billingError.message
        });
        console.error(`[${requestId}] Billing insertion failed for ${billingCandidate?.invoiceDetail?.invoiceno}:`, billingError);
      }
    }

    console.info(`[${requestId}] Billing insertion summary:`, {
      total: logsResult.length,
      successful: billingInsertionResults.filter(r => r.status === 'success').length,
      failed: billingInsertionResults.filter(r => r.status === 'failed').length,
      results: billingInsertionResults
    });

    if (isResend) {
      console.info(`[${requestId}] Resend operation completed successfully`);
      return true;
    }

    console.info(`[${requestId}] SendInvoiceEmail process completed successfully`);
    return res.json({
      message: 'Email is being processed!',
      data: {
        id: taskId,
      },
    });
  } catch (error) {
    console.error(`[${requestId}] SendInvoiceEmail process failed:`, {
      error: error.message,
      stack: error.stack,
      requestData: {
        clNumber: req.body?.clNumber,
        invoiceNo: req.body?.invoiceNo,
        isResend: req.body?.isResend
      }
    });

    // Bug Fix #9: Better error response handling
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Server error',
        requestId: requestId // Include request ID for tracking
      });
    }
  }
};

exports.cancelCL = async (req, res) => {
  const { invoiceNo } = req.params;
  const { cancellationReason } = req.body;

  if (!invoiceNo) {
    res.status(400).json({
      message: 'Please provide invoice number',
    });
  }

  const db = mongoose.connection;
  const rpa = db.collection('logRPA');

  const log = await rpa.findOne({ invoiceNumber: invoiceNo });

  if (!log) {
    res.status(404).json({
      message: 'Invoice not found.',
    });
  }

  await rpa.updateOne(
    { invoiceNumber: invoiceNo },
    {
      $set: {
        status: 'cancelled',
        cancellationReason: cancellationReason || '',
        cancelledOn: new Date().toISOString(),
        modifiedOn: new Date().toISOString(),
      },
    }
  );

  res.json({ message: 'Invoice cancelled successfully' });
};

exports.retrieveInvoice = async (req, res) => {
  try {
    const { status, emailStatus } = req.query;
    const db = mongoose.connection;
    const collection = db.collection('billing');

    const query = {};
    if (status) {
      let filterStatus = status;
      if (status === 'in_progress')
        filterStatus = { $in: ['UNPAID', 'PARTIAL_PAID'] };
      else if (status === 'cancelled') filterStatus = 'CANCELLED';
      else filterStatus = 'PAID';

      query.billingStatus = filterStatus;
    }
    if (emailStatus) {
      if (emailStatus === 'draft' || emailStatus === 'failed') {
        query.emailStatus = { $size: 0 };
      }
    }

    const logs = await collection.find(query).toArray();

    const data = logs.map((item) => {
      const {
        clnumber,
        invoiceno,
        billingStatus,
        emailStatus,
        cancellationReason,
        emailSendDate,
        modifiedOn,
      } = item;

      let returnStatus = 'IN_PROGRESS';
      if (billingStatus === 'PAID') returnStatus = 'COMPLETED';
      if (billingStatus === 'CANCELLED') returnStatus = 'CANCELLED';

      return {
        clNumber: clnumber,
        invoiceNumber: invoiceno,
        status: returnStatus,
        emailStatus: 'SENT',
        emailSendDate: emailSendDate || null,
        cancelledOn: modifiedOn || null,
        cancellationReason: cancellationReason || null,
      };
    });

    res.json({ message: 'Invoice retrieved successfully', data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.uploadInvoiceFile = async (req, res) => {
  res.json({ message: 'File uploaded successfully' });
};

exports.downloadInvoice = async (req, res) => {
  const { id } = req.params;
  const { download } = req.query; // Check if force download (for multiple invoice downloads)

  try {
    const db = mongoose.connection;
    const collection = db.collection('billing');

    const billing = await collection.findOne({ _id: new ObjectId(id) });
    if (!billing) {
      return res.status(404).json({ message: 'Billing not found.' });
    }

    // Ambil logRPA (optional; dipakai kalau kamu butuh timestamp/metadata)
    const logRPACollection = db.collection('logRPA');
    const logRPA = await logRPACollection.findOne({ _id: billing.logId }).catch(() => null);

    // Coba ambil monthDirPath dari DB logDir dulu
    const LogDirCollection = db.collection('logDir');
    const logDirDoc = await LogDirCollection.findOne({ clNumber: billing.clnumber }).catch(() => null);

    let monthDirPath = '';
    if (logDirDoc && logDirDoc.directory) {
      monthDirPath = logDirDoc.directory;
    } else {
      // fallback: baca file logDir.json
      try {
        const raw = await readFile('\\\\ckb-a0000036932\\Invoice Automation\\logDir.json', 'utf8');
        const list = JSON.parse(raw);
        monthDirPath = list.find(it => it.clNumber === billing.clnumber)?.directory || '';
      } catch (e) {
        // kalau gagal baca file, biarkan monthDirPath kosong; nanti tetap dicoba path pertama
        console.warn('[downloadInvoice] fallback logDir.json error:', e?.message);
      }
    }

    // Catat download history (tahan null safety untuk req.user)
    const user = JSON.parse(JSON.stringify(req.user || {}));
    const history = Array.isArray(billing.customerDownloadHistory)
      ? billing.customerDownloadHistory
      : [];
    if (!history.find(h => h.email === (user.email || ''))) {
      history.push({
        email: user.email || '',
        date: new Date().toISOString(),
        name: user.name || '',
      });
      await collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { customerDownloadHistory: history } }
      );
    }

    // Tentukan path file PDF yang valid (coba "Result" dulu, lalu "Archive - Paid Invoice")
    const candidates = [
      `\\\\CKB-A0000036932\\Invoice Automation\\7. Result\\${billing.clnumber}\\${billing.invoiceno}.pdf`,
      `\\\\CKB-A0000036932\\Archive - Paid Invoice\\${monthDirPath}\\${billing.clnumber}\\${billing.invoiceno}.pdf`,
    ];

    // Normalisasi + cek eksistensi
    let pdfPath = null;
    for (const p of candidates) {
      const normalized = path.join(p);
      if (fs.existsSync(normalized)) {
        pdfPath = normalized;
        break;
      }
    }

    if (!pdfPath) {
      return res.json({
        message: 'Invoice file not exist, please check again later',
      });
    }

    // Set header no-cache
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.contentType('application/pdf');

    // If download=true (multiple invoices), force download with attachment
    // Otherwise, preview in browser with inline
    if (download === 'true') {
      res.setHeader('Content-Disposition', `attachment; filename="${billing.invoiceno}.pdf"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${billing.invoiceno}.pdf"`);
    }

    return fs.createReadStream(pdfPath).pipe(res);
  } catch (e) {
    console.error('error ', e);
    return res.status(404).send('404 Not Found');
  }
};

exports.createUser = async (req, res) => {
  try {
    const { email, password, name, contact, accountID } = req.body;

    const existingUser = await User.findOne({ email: email });

    if (existingUser) {
      return res.json({ message: 'already exist' });
    }

    const newUser = new User({
      accountID,
      name,
      contact,
      email,
      password,
      isAutoCreate: true,
      role: ROLES.USER,
    });

    await newUser.save();
  } catch (error) {
    console.error(error);
  }

  return res.json({ message: 'successfully' });
};

exports.resendBillingEmail = async (req, res) => {
  const id = req.body.id;
  const cc = req.body.cc;
  const queryString = req.body?.queryString || '';

  try {
    const db = mongoose.connection;
    const collection = db.collection('billing');

    const singleBilling = await collection.findOne({ _id: new ObjectId(id) });
    console.log(
      `Pemanggilan send invoice email dari aksi resend, dengan cl number: ${singleBilling.clnumber}`
    );
    const allCL = await collection
      .find({ clnumber: singleBilling.clnumber })
      .toArray();

    const invoiceNos = [];
    allCL.forEach((item) => {
      invoiceNos.push(item.invoiceno);
    });

    const cloneReq = { ...req };
    cloneReq.body = {
      clNumber: singleBilling.clnumber,
      invoiceNo: invoiceNos,
      isResend: true,
      cc,
    };

    await this.sendInvoiceEmail(cloneReq, res);

    return res.redirect(`/billing${queryString || ''}`);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getStatusEmail = async (req, res) => {
  const { id } = req.query;
  try {
    if (!id) {
      return res.status(400).json({ message: 'Please provide id' });
    }
    const db = mongoose.connection;
    const collection = db.collection('emailSchaduler');
    const task = await collection.findOne({ _id: new ObjectId(id) });
    if (!task) {
      return res.status(404).json({ message: 'Task email not found' });
    }
    const status = task?.payload?.status;
    return res.json({
      message: 'Successfully',
      data: { status },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

exports.getAllBillingIds = async (req, res) => {
  try {
    const db = mongoose.connection;
    const collection = db.collection('billing');

    // Build query using the same logic as fetch
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
        if (invoiceDate.includes(" - ")) {
          const [start, end] = invoiceDate.split(" - ");
          const startDate = new Date(`${start}T00:00:00.000Z`);
          const endDate = new Date(`${end}T23:59:59.999Z`);
          query["invoice.invdate"] = {
            $gte: startDate,
            $lt: endDate,
          };
        } else {
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

      return query;
    };

    const query = buildBillingSearchQuery(req.query);
    
    // Fetch only _id field to minimize data transfer
    const billings = await collection.find(query, { projection: { _id: 1 } }).toArray();
    
    const ids = billings.map(item => item._id.toString());

    res.json({ 
      ids,
      count: ids.length 
    });
  } catch (error) {
    console.error('Error fetching all billing IDs:', error);
    res.status(500).json({ message: 'Failed to fetch billing IDs' });
  }
};

exports.getAllCustomerBillingIds = async (req, res) => {
  try {
    const db = mongoose.connection;
    const collection = db.collection('billing');

    // Build query similar to fetchCustomerBilling
    const {
      accountID,
      customerName,
      clNumber,
      invoiceNo,
      clDate,
      invoiceDate,
      emailSent,
      billingStatus,
      range,
    } = req.query;

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

    // Filter by account id (important for USER role)
    const clonedUser = JSON.parse(JSON.stringify(req.user));

    if (req.query.accountID) {
      query["accountID"] = { $eq: req.query.accountID };
    } else {
      if (req.user.role == 'USER') {
        query["accountID"] = { $in: clonedUser.accountID };
      }
    }

    // Fetch only _id field
    const billings = await collection.find(query, { projection: { _id: 1 } }).toArray();
    
    const ids = billings.map(item => item._id.toString());

    res.json({ 
      ids,
      count: ids.length 
    });
  } catch (error) {
    console.error('Error fetching all customer billing IDs:', error);
    res.status(500).json({ message: 'Failed to fetch customer billing IDs' });
  }
};
