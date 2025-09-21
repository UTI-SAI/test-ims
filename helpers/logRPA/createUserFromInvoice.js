const bcrypt = require("bcrypt");

function logWithTimestamp(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}]: ${message}`);
}

exports.processUserInvoices = async (emails, invoiceDetail, userCollection) => {
  const salt = await bcrypt.genSalt(10);

  for (const email of emails) {
    const password = await bcrypt.hash(email, salt);
    const user = {
      accountID: [invoiceDetail.customer],
      name: invoiceDetail.cloCustName,
      email,
      password,
      role: "USER",
      createdOn: new Date().toISOString(),
      modifiedOn: new Date().toISOString(),
      importFromInvoice: true,
    };

    const existingUser = await userCollection.findOne({ email: user.email });

    if (existingUser) {
      logWithTimestamp(
        `User ${user.email} already exists. Checking Account ID...`
      );
      const { accountID } = existingUser;
      const isAccountIDsame = accountID.includes(invoiceDetail.customer);

      if (!isAccountIDsame) {
        logWithTimestamp(
          `User ${user.email} adding Account ID : ${invoiceDetail.customer}`
        );
        accountID.push(invoiceDetail.customer);
        await userCollection.updateOne(
          { email: user.email },
          {
            $set: {
              accountID: accountID,
              modifiedOn: new Date().toISOString(),
            },
          }
        );
        logWithTimestamp(`Finish adding ${invoiceDetail.customer}`);
      }
    } else {
      logWithTimestamp(`Inserting user ${user.email}`);
      await userCollection.insertOne(user);
    }
  }
};
