const express = require("express");
const router = express.Router();
const rejectedInvoiceEmailController = require("../controllers/rejectedInvoiceEmail");
const { ensureRoles } = require("../middleware/auth");
const { ROLES } = require("../constants");

// All routes are restricted to SUPER_ADMIN only
router.get(
    "/",
    ensureRoles(ROLES.SUPER_ADMIN),
    rejectedInvoiceEmailController.fetch
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