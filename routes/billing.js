const express = require("express");
const router = express.Router();
const billingController = require("../controllers/billing");
const { ensureRoles } = require("../middleware/auth");
const { ROLES } = require("../constants");

router.post(
  "/attach-file",
  ensureRoles(ROLES.SUPER_ADMIN),
  billingController.attachFile
);

router.post(
  "/cancel",
  ensureRoles(ROLES.SUPER_ADMIN),
  billingController.cancel
);

router.post(
  "/customer-reject-invoice",
  ensureRoles(ROLES.USER),
  billingController.rejectInvoice
);

router.get(
  "/exports",
  ensureRoles(ROLES.SUPER_ADMIN),
  billingController.exports
);

router.get(
  "/exports-customer",
  ensureRoles(ROLES.USER),
  billingController.exportsCustomerBilling
);

module.exports = router;
