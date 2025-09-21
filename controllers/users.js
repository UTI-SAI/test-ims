const { ROLES } = require("../constants");
const { createQueryString } = require("../helpers/createQueryString");
const sendResetPasswordEmail = require("../helpers/sendResetPasswordEmail");
const User = require("../models/User");

exports.fetch = async (req, res) => {
  try {
    const { name, role, email } = req.query;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;

    const skip = (page - 1) * pageSize;
    const totalUsersQuery = User.find().where("role").ne(ROLES.SUPER_ADMIN);

    if (role) {
      totalUsersQuery.where("role").equals(role);
    }

    if (name) {
      totalUsersQuery.where("name").regex(new RegExp(name, "i"));
    }

    if (email) {
      totalUsersQuery.where("email").regex(new RegExp(email, "i"));
    }

    const totalUsers = await totalUsersQuery.countDocuments();

    // Calculate totalPages based on filtered data
    const totalPages = Math.ceil(totalUsers / pageSize);

    const query = User.find()
      .skip(skip)
      .limit(pageSize)
      .where("role")
      .ne(ROLES.SUPER_ADMIN);

    if (role) {
      query.where("role").equals(role);
    }

    if (name) {
      query.where("name").regex(new RegExp(name, "i"));
    }

    if (email) {
      query.where("email").regex(new RegExp(email, "i"));
    }

    const users = await query.exec();

    const startIdx = (page - 1) * pageSize + 1;
    const endIdx = startIdx + users.length - 1;

    const queryString = createQueryString({ ...req.query });

    res.render("users", {
      queryString,
      user: req.user,
      users,
      currentPage: page,
      totalPages,
      pageSize,
      startIdx,
      endIdx,
      totalUsers,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
};

exports.add = async (req, res) => {
  try {
    const { email, password, name, contact } = req.body;

    const newUser = new User({
      name,
      contact,
      email,
      password,
      role: ROLES.ADMIN,
    });

    await newUser.save();

    req.flash("success", "Admin added successfully!");
    res.redirect("/users");
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, name, contact } = req.body;

    const user = await User.findByIdAndUpdate(
      id,
      { name, contact, email },
      { new: true }
    );

    if (!user) {
      return res.status(404).send("User not found");
    }

    req.flash("success", "Data updated successfully!");
    res.redirect("/users");
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await user.deleteOne();

    res.status(200).json({ message: "User deleted successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { id } = req.body;

    // Find user by ID
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await sendResetPasswordEmail(user.email, user._id.toString());

    res.status(200).json({ message: "Password reset sent to email." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
