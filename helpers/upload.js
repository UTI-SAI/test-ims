const multer = require("multer");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const extension = file.originalname.split('.').pop();
    const customFilename = (req.body.filename || file.originalname.split('.').shift()) + '.' + extension;
    cb(null, customFilename);
  },
});

const upload = multer({ storage: storage });

module.exports = upload;
