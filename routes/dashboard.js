const express = require("express");
const router = express.Router();
const logRPAController = require("../controllers/logRPA");
const billingController = require("../controllers/billing");
const { ensureAuthenticated, ensureRoles } = require("../middleware/auth");
const { ROLES } = require("../constants");

router.get("/", ensureAuthenticated, (req, res) => {
  // delete req.session.returnTo;
  switch (req.user.role) {
    case ROLES.SUPER_ADMIN:
      return res.redirect("/billing");
    case ROLES.ADMIN:
      return res.redirect("/billing");
    case ROLES.USER:
      return res.redirect("/customer-document");
    default:
      return res.redirect("/auth/login");
  }
});

router.get(
  "/billing",
  ensureRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN),
  billingController.fetch
);

// Fetch Log RPA
router.get(
  "/document",
  ensureRoles(ROLES.SUPER_ADMIN, ROLES.ADMIN),
  logRPAController.fetch
);

// Customer Billing
router.get(
  "/customer-document",
  ensureRoles(ROLES.USER),
  billingController.fetchCustomerBilling
);

// Get self profile
router.get("/me", ensureRoles(ROLES.ADMIN, ROLES.USER), (req, res) => {
  res.render("me", {
    user: req.user,
  });
});

module.exports = router;
