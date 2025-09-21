const fs = require("fs");
const path = require("path");
const moment = require("moment");
const sendEmail = require("./sendEmail");

const sendInvoiceRPA = async (user, invoice, email, cc, instansi="") => {
  try {
    const { HOST } = process.env;
    const URL = `${HOST}/customer-document?clNumber=${invoice.clnumber.toString()}`;

    // Load HTML Template
    const filePath = path.join(
      __dirname,
      "../public/static/html/invoice-rpa.html"
    );
    const htmlString = fs.readFileSync(filePath, "utf8");
    let emailHtml = htmlString.replace("{CUSTOMER_NAME}", instansi);
    // emailHtml = emailHtml.replace(
    //   "{INVOICE_DATE}",
    //   moment(invoice.invdate).format("DD / MM / YYYY")
    // );
    emailHtml = emailHtml.replace("{INVOICE_NUMBER_ALL}", invoice.invoiceNoAll);
    emailHtml = emailHtml.replace("{CL_NUMBER}", invoice.clnumber);
    // emailHtml = emailHtml.replace("{AMOUNT}", invoice.invamount);
    emailHtml = emailHtml.replace("{INVOICE_URL}", URL);

    const formattedInvoiceDate = moment(invoice.invdate).format("DD MMM YY");

    const emailData = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `CKB - ${formattedInvoiceDate} - ${invoice.clnumber} - ${instansi}`,
      html: emailHtml,
    };

    if (cc && cc?.length > 0) {
      emailData.cc = cc;
    }

    return sendEmail(emailData);
  } catch (error) {
    console.error(error);
  }
};

module.exports = sendInvoiceRPA;
