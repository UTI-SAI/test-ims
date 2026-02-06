const passport = require("passport");
const User = require("../models/User");
const decrypt = require("../helpers/decrypt");
const sendResetPasswordEmail = require("../helpers/sendResetPasswordEmail");
require("../passport-config")(passport);

exports.getRegisterPage = (req, res) => {
  res.render("register");
};

exports.getLoginPage = (req, res) => {
  const returnTo = req.query.returnTo || "/";
  res.render("login", { returnTo: returnTo });
};

exports.handleLogin = (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) {
      return next(err);
    }

    if (!user) {
      req.flash("error", info.message);
      return res.redirect(
        `/auth/login?returnTo=${encodeURIComponent(req.originalUrl)}`
      );
    }

    req.logIn(user, (err) => {
      if (err) {
        return next(err);
      }

      const returnTo = req.body.returnTo || "/";
      return res.redirect(decodeURIComponent(returnTo));
    });
  })(req, res, next);
};

exports.forgotPassword = async (req, res) => {
  if (req.method === "POST") {
    const { email } = req.body;
    const user = await User.findOne({
      email: { $regex: new RegExp(`^${email}$`, 'i') },
      role: { $ne: "SUPER_ADMIN" }
    });
    if (!user?._id) {
      req.flash("error", "User not found.");
    } else {
      await sendResetPasswordEmail(user.email, user._id.toString());
      req.flash("success", "Reset password confirmation sent to your email.");
    }

    return res.redirect("/auth/forgot-password");
  }

  res.render("forgotPassword");
};

exports.resetPasswordPage = async (req, res) => {
  const { token } = req.params;
  console.log(req?.body);
  const id = decrypt(token);

  if (req.method === "POST") {
    const id = req.body.id;
    const user = await User.findById(id);

    user.password = req.body.password;
    await user.save();
    req.flash("success", "Password has been reset successfully");
    return res.redirect(`/auth/login`);
  }

  res.render("resetPassword", {
    id,
    token,
  });
};
