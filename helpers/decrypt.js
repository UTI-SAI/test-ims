const crypto = require("crypto");

const secretKey = Buffer.from(process.env.SECRET_KEY, "utf-8");

const decrypt = (text) => {
  try {
    const textParts = text.split(":");
    const iv = Buffer.from(textParts.shift(), "hex");
    const encryptedText = Buffer.from(textParts.join(":"), "hex");

    const decipher = crypto.createDecipheriv("aes-256-cbc", secretKey, iv);

    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString();
  } catch (e) {
    console.error(e);
  }

  return null;
};

module.exports = decrypt;
