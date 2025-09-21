function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.redirect(`/auth/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
}

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect("/billing");
  }
  next();
}

function ensureRoles(...allowedRoles) {
  return function (req, res, next) {
    console.log('In ensureRoles. Original URL:', req.originalUrl);
    console.log('Storing in session:', req.originalUrl);

    if (!req.isAuthenticated()) {
      return res.redirect(`/auth/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
    }

    const userRole = req.user.role;

    if (allowedRoles.includes(userRole)) {
      return next();
    }

    return res.redirect(`/`);
  };
}

function ensureAPIKey(req, res, next) {
  const apiKey = req.header("X-API-KEY");
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).send("Unauthorized");
  }

  return next();
}

module.exports = {
  ensureAuthenticated,
  checkNotAuthenticated,
  ensureRoles,
  ensureAPIKey,
};
