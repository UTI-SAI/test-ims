const express = require("express");
const router = express.Router();
const userController = require("../controllers/users");
const { ROLES } = require("../constants");
const { ensureRoles } = require("../middleware/auth");

// Add User
router.post("/", ensureRoles(ROLES.SUPER_ADMIN), userController.add);

// Reset User Password
router.post(
  "/reset-password",
  ensureRoles(ROLES.SUPER_ADMIN),
  userController.resetPassword
);

// Delete User
router.delete("/:id", ensureRoles(ROLES.SUPER_ADMIN), userController.delete);

// Edit User
router.post("/:id", ensureRoles(ROLES.SUPER_ADMIN), userController.update);

// Fetch Users
router.get("/", ensureRoles(ROLES.SUPER_ADMIN), userController.fetch);

module.exports = router;
