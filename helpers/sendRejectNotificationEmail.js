const { generateRejectInvoiceEmail } = require("../helpers/generateRejectInvoiceEmail");
const sendEmail = require("./sendEmail");

const sendRejectNotificationEmail = async (db, invoiceData, options) => {
  const { type, info, reason, customToEmails } = options;

  try {
    if (invoiceData) {
      const accountID = invoiceData.accountID;
      console.info("Looking up email configuration for accountID:", accountID);

      // Get email configuration from rejectedInvoiceEmails collection
      const emailConfigCollection = db.collection("rejectedInvoiceEmails");
      const emailConfig = await emailConfigCollection.findOne({ accountID: accountID });
      console.info("Email config found:", emailConfig ? "Yes" : "No");

      if (!emailConfig) {
        console.info("❌ No email configuration found for accountID:", accountID);
        console.info("Skipping email notification");
      } else {
        console.info("Email config details:", {
          accountID: emailConfig.accountID,
          email_main_pic: emailConfig.email_main_pic,
          email_comm: emailConfig.email_comm,
          email_comm_manager: emailConfig.email_comm_manager,
          email_milist_com: emailConfig.email_milist_com,
          email_finance: emailConfig.email_finance
        });

        const documentNumber = invoiceData.invoice?.clnumber || invoiceData.clnumber || 'Unknown';
        console.info("Generated document number:", documentNumber);

        // Prepare email data
        const emailData = {
          documentNumber: documentNumber,
          info: info,
          type: type,
          invoices: [
            {
              invoiceNumber: invoiceData.invoice?.invoiceno || invoiceData.invoiceno || 'Unknown',
              clNumber: invoiceData.invoice?.clnumber || invoiceData.clnumber || 'Unknown',
              reason: reason || "No reason provided"
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

        // Prepare email recipients (handle arrays)
        const toEmails = [];
        const ccEmails = [];

        // Add TO recipients (email_main_pic and email_comm arrays)
        if (Array.isArray(emailConfig.email_main_pic)) {
          emailConfig.email_main_pic.forEach(email => {
            if (email && email.trim()) {
              toEmails.push(email.trim());
            }
          });
        } else if (emailConfig.email_main_pic) {
          toEmails.push(emailConfig.email_main_pic);
        }

        if (Array.isArray(emailConfig.email_comm)) {
          emailConfig.email_comm.forEach(email => {
            if (email && email.trim()) {
              toEmails.push(email.trim());
            }
          });
        } else if (emailConfig.email_comm) {
          toEmails.push(emailConfig.email_comm);
        }

        // Add CC recipients (email_comm_manager, email_milist_com, email_finance arrays)
        if (Array.isArray(emailConfig.email_comm_manager)) {
          emailConfig.email_comm_manager.forEach(email => {
            if (email && email.trim()) {
              ccEmails.push(email.trim());
            }
          });
        } else if (emailConfig.email_comm_manager) {
          ccEmails.push(emailConfig.email_comm_manager);
        }

        if (Array.isArray(emailConfig.email_milist_com)) {
          emailConfig.email_milist_com.forEach(email => {
            if (email && email.trim()) {
              ccEmails.push(email.trim());
            }
          });
        } else if (emailConfig.email_milist_com) {
          ccEmails.push(emailConfig.email_milist_com);
        }

        if (Array.isArray(emailConfig.email_finance)) {
          emailConfig.email_finance.forEach(email => {
            if (email && email.trim()) {
              ccEmails.push(email.trim());
            }
          });
        } else if (emailConfig.email_finance) {
          ccEmails.push(emailConfig.email_finance);
        }

        const toEmailList = customToEmails || toEmails || [];
        const ccEmailList = [
          ...toEmails,
          ...ccEmails
        ]

        console.info("Email recipients prepared:", {
          to: toEmailList,
          cc: ccEmailList
        });

        // Send email
        if (emailHtml && toEmailList.length > 0) {
          const emailOptions = {
            to: toEmailList.join(', '),
            cc: ccEmailList.length > 0 ? ccEmailList.join(', ') : undefined,
            subject: type === 'CANCEL_REJECT' 
              ? `Invoice Cancel Rejected Notification - Doc ${documentNumber}`
              : `Invoice Rejected Notification - Doc ${documentNumber}`,
            html: emailHtml,
            text: type === 'CANCEL_REJECT'
              ? `Invoice ${emailData.invoices[0].invoiceNumber} has been cancel rejected. Reason: ${reason}`
              : `Invoice ${emailData.invoices[0].invoiceNumber} has been rejected. Reason: ${reason}`
          };

          // Add CC if there are CC recipients
          if (ccEmails.length > 0) {
            emailOptions.cc = ccEmails.join(', ');
          }

          console.info("Attempting to send email with options:", {
            to: emailOptions.to,
            cc: emailOptions.cc || 'None',
            subject: emailOptions.subject
          });

          const emailResult = await sendEmail(emailOptions);
          console.info("Email send result:", emailResult);
          console.info(`✅ Reject notification email queued for Invoice: ${emailData.invoices[0].invoiceNumber}`);
          console.info(`   TO: ${emailOptions.to}`);
          if (emailOptions.cc) {
            console.info(`   CC: ${emailOptions.cc}`);
          }
        } else {
          console.info("❌ Email HTML is empty or no TO recipients, email not sent");
        }
      }
    } else {
      console.info("❌ No invoice data found, email not sent");
    }
  } catch (emailError) {
    console.error("❌ Error sending reject notification email:", emailError);
    console.error("Email error stack:", emailError.stack);
    // Don't fail the main operation if email fails
  }
};

module.exports = sendRejectNotificationEmail;
