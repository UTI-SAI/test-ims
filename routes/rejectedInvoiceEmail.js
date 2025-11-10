const express = require("express");
const router = express.Router();
const rejectedInvoiceEmailController = require("../controllers/rejectedInvoiceEmail");
const { ensureRoles } = require("../middleware/auth");
const { ROLES } = require("../constants");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure uploads directory exists
const uploadsDir = 'uploads/';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Created uploads directory');
}

// Configure multer for Excel file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'email-settings-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        // Accept Excel files only
        const filetypes = /xlsx|xls/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype) ||
            file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            file.mimetype === 'application/vnd.ms-excel';

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only Excel files are allowed!'));
        }
    },
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// All routes are restricted to SUPER_ADMIN only
router.get(
    "/",
    ensureRoles(ROLES.SUPER_ADMIN),
    rejectedInvoiceEmailController.fetch
);

// Bulk import from Excel (must be before /:id route)
router.post(
    "/bulk-import",
    ensureRoles(ROLES.SUPER_ADMIN),
    function (req, res, next) {
        upload.single('file')(req, res, function (err) {
            if (err instanceof multer.MulterError) {
                // A Multer error occurred when uploading
                return res.status(400).json({
                    success: false,
                    message: `Upload error: ${err.message}`
                });
            } else if (err) {
                // An unknown error occurred
                return res.status(400).json({
                    success: false,
                    message: err.message || 'File upload failed'
                });
            }
            // Everything went fine, proceed to controller
            next();
        });
    },
    rejectedInvoiceEmailController.bulkImport
);

router.post(
    "/create",
    ensureRoles(ROLES.SUPER_ADMIN),
    rejectedInvoiceEmailController.create
);

router.get(
    "/:id",
    ensureRoles(ROLES.SUPER_ADMIN),
    rejectedInvoiceEmailController.getById
);

router.put(
    "/:id",
    ensureRoles(ROLES.SUPER_ADMIN),
    rejectedInvoiceEmailController.update
);

router.delete(
    "/:id",
    ensureRoles(ROLES.SUPER_ADMIN),
    rejectedInvoiceEmailController.delete
);

module.exports = router;