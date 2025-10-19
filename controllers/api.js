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
  try {
    const { clNumber, subject, invoiceNo, ignoreEmail, isResend } = req.body;
    const cc = req?.body?.cc || null;

    console.log(
      `Pemanggilan send invoice email dari API, dengan cl number: ${clNumber}`
    );

    if (!invoiceNo || invoiceNo?.length === 0) {
      res.status(400).json({ message: 'Please provide invoiceNo data' });
      return;
    }

    const db = mongoose.connection;
    const rpa = db.collection('logRPA');

    const checkRPA = await rpa
      .find({
        clNumber,
      })
      .toArray();

    // Check RPA from RPA Server if not found
    if (!checkRPA || checkRPA?.length === 0) {
      await lookUpRPA(clNumber, invoiceNo);
    }

    let logsResult = await rpa
      .find({
        clNumber,
        // statuses: { $nin: ['ARCHIVE HC', 'EMAIL NOT FOUND'] },
      })
      .toArray();

    if (!logsResult || logsResult?.length === 0) {
      res.status(400).json({
        message:
          "Invoice not found or Some customers on this cover list don't have an email.",
      });
      return;
    }

    const logs = logsResult[0];

    // Collect all logs that doesnt have a emailSendDate
    const logsCustomerEmails = await rpa
      .find({
        clNumber,
        // statuses: { $nin: ['ARCHIVE HC', 'EMAIL NOT FOUND'] },
        // emailSendDate: { $exists: false }
      })
      .toArray();

    // Collect all target emails
    const targetEmails = [];
    let instansi = '';
    for (let i = 0; i < logsCustomerEmails.length; i++) {
      const { invoiceDetail } = logsCustomerEmails[i];
      const { addrEmail, cloCustName } = invoiceDetail;

      instansi = cloCustName;
      if (addrEmail && addrEmail?.includes('@')) {
        const logEmails = extractEmails(addrEmail);
        logEmails.forEach((email) => {
          if (!targetEmails.includes(email)) {
            targetEmails.push(email);
          }
        });
      }
    }

    if (targetEmails.length === 0) {
      if (logsResult.length > 0) {
        for (const billingCandidate of logsResult) {
          await Billing.insertBilling(null, billingCandidate, null, cc);
        }
        return res.json({
          message: 'Invoices have been inserted into billing!',
        });
      }

      return res.json({ message: 'Email is being processed!' });
    }

    const mainEmail = targetEmails?.join(',');

    const users = await User.find({ email: targetEmails[0] });

    // Collect all invoice no
    const uniqueInvoices = new Set();
    logs.invoiceDetail.invoiceNoAll = logsResult
      .filter((it) => {
        const invoiceNo = it.invoiceDetail.invoiceno;
        if (uniqueInvoices.has(invoiceNo)) {
          return false; // Abaikan jika sudah ada
        }
        uniqueInvoices.add(invoiceNo); // Tambahkan ke Set
        return true; // Masukkan ke hasil filter
      })
      .map((it) => `<li>${it.invoiceDetail.invoiceno}</li>`)
      .join('');

    let taskId = null;

    if (!ignoreEmail) {
      taskId = await sendInvoiceRPA(
        users[0],
        logs.invoiceDetail,
        mainEmail,
        cc,
        instansi
      );
    }

    await rpa.updateMany(
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

    // Insert billing
    for (const billingCandidate of logsResult) {
      await Billing.insertBilling(users, billingCandidate, targetEmails, cc);
    }

    if (isResend) {
      return true;
    }

    return res.json({
      message: 'Email is being processed!',
      data: {
        id: taskId,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
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

  try {
    const db = mongoose.connection;
    const collection = db.collection('billing');

    const billing = await collection.findOne({ _id: new ObjectId(id) });

    if (!billing) {
      res.status(404).json({
        message: 'Billing not found.',
      });
    }

    const logRPACollection = db.collection('logRPA');
    const logRPA = await logRPACollection.findOne({ _id: billing.logId });

    // check db logDir first
    const LogDirCollection = db.collection('logDir');
    const logDir = await LogDirCollection.findOne({
      clNumber: billing.clnumber,
    });

    let monthDirPath = '';
    const { customerDownloadHistory = [], clnumber, invoiceno } = billing;

    if (logDir === null) {
      const logDirResult = await readFile(
        '\\\\ckb-a0000036932\\Invoice Automation\\logDir.json',
        'utf8'
      );

      const logDirList = JSON.parse(logDirResult);

      const { timestamp } = logRPA;

      monthDirPath = logDirList.find(
        (it) => it.clNumber === clnumber
      )?.directory;
    } else {
      monthDirPath = logDir.directory;
    }

    const user = JSON.parse(JSON.stringify(req.user));

    const isExist = customerDownloadHistory.find(
      (item) => item.email === user.email
    );

    if (!isExist) {
      customerDownloadHistory.push({
        email: user.email,
        date: new Date().toISOString(),
        name: user.name,
      });
    }

    await collection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          customerDownloadHistory: customerDownloadHistory,
        },
      }
    );

    let networkPath = `\\\\CKB-A0000036932\\Invoice Automation\\7. Result\\${clnumber}\\${invoiceno}.pdf`;

    if (billing.billingStatus === 'PAID') {
      networkPath = `\\\\CKB-A0000036932\\Archive - Paid Invoice\\${monthDirPath}\\${clnumber}\\${invoiceno}.pdf`;
    }

    const pdfPath = path.join(networkPath);

    // CHeck if path valid to prevent app terminated
    if (!fs.existsSync(pdfPath)) {
      console.log('Path is not valid');
      return res.json({
        message: 'Invoice file not exist, please check again later',
      });
    }

    res.contentType('application/pdf');

    const stream = fs.createReadStream(pdfPath);
    stream.on('error', (err) => {
      console.error('Stream error:', err);
      if (!res.headersSent) {
        res.status(500).send('Error reading file');
      }
    });

    stream.pipe(res);
  } catch (e) {
    console.error('error ', e);
    res.status(404).send('404 Not Found');
  }

  // return res.redirect(
  //   `/invoices/${billing.invoiceno}-${billing.logId.toString()}.pdf`
  // );
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
