const moment = require('moment-timezone');
const ObjectId = require('mongodb').ObjectId;
const mongoose = require('mongoose');

exports.insertBilling = async (users, logRPA, emails, cc) => {
  try {
    const db = mongoose.connection;
    const billing = db.collection('billing');

    const dateNow = new Date().toISOString();

    const { clnumber, invoiceno } = logRPA.invoiceDetail;

    const checkExistingBill = await billing.findOne({
      clnumber,
      invoiceno,
      billingStatus: { $ne: 'CANCELLED' },
    });

    if (checkExistingBill) {
      console.error(`Billing ${invoiceno} already exist. Skipping...`);
      const resendDate = moment()
        .tz('Asia/Jakarta')
        .format('YYYY-MM-DDTHH:mm:ss.SSSZ');
      await billing.findOneAndUpdate(
        { clnumber, invoiceno, billingStatus: { $ne: 'CANCELLED' } },
        { $set: { cc, resendDate } }
      );
      return checkExistingBill;
    }

    const newBilling = {
      logId: logRPA._id,
      clnumber,
      invoiceno,
      createdOn: dateNow,
      modifiedOn: dateNow,
      customerDownloadStatus: 'NOT_DOWNLOAD_YET',
      customerDownloadHistory: [],
      billingStatus: 'UNPAID',
      userId: null,
      accountID: logRPA.invoiceDetail.customer,
      userName: null,
      cloCustName: logRPA.invoiceDetail.cloCustName,
      timestamp: logRPA.timestamp,
      sentTo: null,
      cc,
      emailSendDate: moment()
        .tz('Asia/Jakarta')
        .format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
      invoice: logRPA.invoiceDetail,
    };

    if (users) {
      const userIds = users.map((it) => it._id.toString());
      newBilling.userId = userIds;
      newBilling.userName = users[0]?.name;
    }
    if (emails) {
      newBilling.sentTo = emails;
    }

    await billing.insertOne(newBilling);
    console.log('Insert billing data.');

    return newBilling;
  } catch (error) {
    console.error(error);
  }

  return null;
};
