const sql = require("mssql");
const { MongoClient } = require("mongodb");
const fs = require("fs");
const path = require("path");
const convertObjectToCamelCase = require("./toCamelCase");
// const createUser = require("../../helpers/createUser");
const extractEmails = require("./extractEmails");
const { processUserInvoices } = require("./createUserFromInvoice");
const query4 = fs.readFileSync(path.join(__dirname, "query4.sql"), "utf-8");

function logWithTimestamp(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}]: ${message}`);
}

const lookUpRPA = async (originalCLNumber, originalInvoiceNo) => {
  try {
    const invoiceNoList = Array.isArray(originalInvoiceNo)
      ? originalInvoiceNo.map((it) => String(it).trim()).filter(Boolean)
      : typeof originalInvoiceNo === "string"
      ? originalInvoiceNo
          .split(",")
          .map((it) => it.trim())
          .filter(Boolean)
      : [];

    // Connect to SQL Server database
    const pool = await sql.connect({
      server: "10.144.230.5",
      database: "scmdb",
      user: "Select",
      password: "@only#btn.2025",
      options: {
        encrypt: true,
        trustServerCertificate: true,
      },
      pool: {
        max: 20000,
        min: 0,
        idleTimeoutMillis: 90000000,
      },
    });
    logWithTimestamp("Connected to SQL Server.");

    // Connect to MongoDB database
    const client = await MongoClient.connect(
      "mongodb://127.0.0.1:27017/billing-monitoring",
      {
        useUnifiedTopology: true,
      }
    );
    logWithTimestamp("Connected to MongoDB.");

    const db = client.db("billing-monitoring");
    const collection = db.collection("logRPA");
    const userCollection = db.collection("users");

    const clNumber = originalCLNumber;
    const clNumberFile = originalCLNumber;

    logWithTimestamp(`CL -> ${clNumber}`);

    // Query CL
    logWithTimestamp(`Executing query for CL_NUMBER: ${clNumber}`);
    let formattedQuery = query4.replace("{CL_NUMBER}", clNumber);
    let { recordset, rowsAffected } = await pool
      .request()
      .query(formattedQuery);
    logWithTimestamp(`Query executed. Rows affected: ${rowsAffected}`);

    logWithTimestamp(`Finished querying CL -> ${clNumber}`);
    logWithTimestamp(`Rows affected: ${rowsAffected}`);

    const affectedRows = Array.isArray(rowsAffected)
      ? rowsAffected.reduce((sum, value) => sum + (Number(value) || 0), 0)
      : Number(rowsAffected) || 0;

    if (!recordset || recordset.length === 0 || affectedRows === 0) {
      logWithTimestamp("No record found, skipping...");
      return null;
    }

    let isUserFound = true;

    for (const item of recordset) {
      let invoiceRecord = { ...item };

      if (
        invoiceNoList.length > 0 &&
        !invoiceNoList.includes(item.invoiceno2) &&
        !invoiceNoList.includes(item.invoice_no)
      ) {
        continue;
      }

      const actualInvoiceNo = invoiceNoList.find(
        (it) => it === item.invoiceno2 || it === item.invoice_no
      ) || item.invoiceno2 || item.invoice_no;

      invoiceRecord.invoiceno = actualInvoiceNo;
      invoiceRecord.invoice_no = actualInvoiceNo;

      if (invoiceRecord) {
        logWithTimestamp(`Execute Invoice -> ${invoiceRecord.invoiceNumber}`);
        const invoiceDetail = convertObjectToCamelCase(invoiceRecord);

        // Create User From Invoice Info
        const { addrEmail } = invoiceDetail;
        if (addrEmail && addrEmail?.includes("@")) {
          const emails = extractEmails(addrEmail);
          invoiceDetail.targetEmails = emails || [];
          logWithTimestamp("Start Process User Email Address");
          await processUserInvoices(emails, invoiceDetail, userCollection);
          logWithTimestamp("Finish Process User Email Address");
        }

        // Check customer status
        if (invoiceDetail.customer) {
          const existingCustomers = await userCollection.findOne({
            accountID: invoiceDetail.customer,
          });

          if (!existingCustomers) {
            isUserFound = false;
          }
        }

        const log = {
          clNumber,
          clNumberFile,
          status: "in_progress",
          timestamp: new Date().toISOString(),
          statuses: isUserFound ? [] : ["EMAIL NOT FOUND"],
          statusRemark: [],
          createdOn: new Date().toISOString(),
          modifiedOn: new Date().toISOString(),
          emailStatus: "draft",
          cancellationReason: null,
          cancelledOn: null,
          cancelledOn: null,
          invoiceNumber: invoiceDetail.invoiceNo,
          invoiceDetail,
        };

        // Inserting log
        logWithTimestamp(`Inserting log ${invoiceRecord.invoiceNumber}`);
        await collection.insertOne(log);
      }
    }

    logWithTimestamp("All RPA logs have been transferred to MongoDB.");
    await client.close();
    await pool.close();
  } catch (error) {
    console.log(error);
  }

  return null;
};

module.exports = lookUpRPA;
