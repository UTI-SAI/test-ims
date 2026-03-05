const fs = require("fs");
const path = require("path");
const multer = require("multer");

const uploadDir = path.join(__dirname, "..", "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const extension = file.originalname.split('.').pop();
    const customFilename = (req.body.filename || file.originalname.split('.').shift()) + '.' + extension;
    cb(null, customFilename);
  },
});

const upload = multer({ storage: storage });

module.exports = upload;
