const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth");
const { checkNotAuthenticated } = require("../middleware/auth");

// router.get("/register", checkNotAuthenticated, authController.getRegisterPage);
// router.post("/register", authController.register);

router.get("/login", checkNotAuthenticated, authController.getLoginPage);
router.post("/login", authController.handleLogin);

router.get("/logout", (req, res) => {
  req.logout(() => {
    res.redirect("/auth/login");
  });
});

router.get(
  "/forgot-password",
  checkNotAuthenticated,
  authController.forgotPassword
);
router.post(
  "/forgot-password",
  checkNotAuthenticated,
  authController.forgotPassword
);
router.get(
  "/reset-password/:token",
  checkNotAuthenticated,
  authController.resetPasswordPage
);
router.post(
  "/reset-password",
  checkNotAuthenticated,
  authController.resetPasswordPage
);

module.exports = router;
