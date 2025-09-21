const express = require("express");
const router = express.Router();
const logRPAController = require("../controllers/logRPA");
const { ensureRoles } = require("../middleware/auth");
const { ROLES } = require("../constants");

router.post(
  "/cancel-invoice",
  ensureRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN),
  logRPAController.cancelInvoice
);

router.get(
  "/exports",
  ensureRoles(ROLES.SUPER_ADMIN),
  logRPAController.exports
);

module.exports = router;
