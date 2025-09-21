const buildStatusAndRemark = (item) => {
    const statuses = [];
    const statusRemark = [];

    const {
        invoiceReady,
        fakturPajakReady,
        supportingDocumentReady,
        mergeStamp,
        eMeteraiAttached,
        emailSent,
        HC,
    } = item;

    if (!invoiceReady || !fakturPajakReady || !supportingDocumentReady || !mergeStamp || !eMeteraiAttached) {
        statuses.push('DOCUMENT NOT COMPLETE');
    }

    if (!invoiceReady) {
        statusRemark.push('NEED INVOICE');
    }

    if (!fakturPajakReady) {
        statusRemark.push('NEED FAKTUR PAJAK');
    }

    if (!mergeStamp) {
        statusRemark.push('NEED SIGN & STAMP');
    }

    if (!eMeteraiAttached) {
        statusRemark.push('NEED MATERAI');
        statuses.push('E-MATERAI NOT ATTACHED');
    }

    if (!supportingDocumentReady) {
        statusRemark.push('NEED SUPPDOC');
    }

    if (!emailSent && !HC) {
        statuses.push('INVOICE EMAIL NOT SEND');
    }

    if (emailSent && !HC) {
        statuses.push('INVOICE SENT');
    }

    if (HC) {
        statuses.push('ARCHIVE HC');
    }

    return {
        statusRemark,
        statuses,
    }
}

module.exports = buildStatusAndRemark;