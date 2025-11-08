const moment = require("moment");
const ObjectId = require("mongodb").ObjectId;
const mongoose = require("mongoose");
const { createQueryString } = require("../helpers/createQueryString");
const RejectedInvoiceEmail = require("../models/RejectedInvoiceEmail");

// Fetch all rejected invoice emails with pagination
exports.fetch = async (req, res) => {
    try {
        const { page = 1, pageSize = 10, accountID, email } = req.query;
        const skip = (page - 1) * pageSize;
        const limit = parseInt(pageSize);

        // Build query
        const query = {};
        if (accountID) {
            query.accountID = { $regex: accountID, $options: "i" };
        }
        if (email) {
            query.emails = { $in: [new RegExp(email, "i")] };
        }

        const db = mongoose.connection;
        const collection = db.collection("rejectedInvoiceEmails");

        const rejectedEmails = await collection
            .find(query)
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 })
            .toArray();

        const totalEmails = await collection.countDocuments(query);
        const totalPages = Math.ceil(totalEmails / pageSize);
        const startIdx = skip + 1;
        const endIdx = skip + rejectedEmails.length;

        const queryString = createQueryString({ ...req.query });

        res.render("rejectedInvoiceEmails", {
            queryString,
            moment,
            user: req.user,
            rejectedEmails,
            currentPage: parseInt(page),
            pageSize: parseInt(pageSize),
            totalPages,
            startIdx,
            endIdx,
            totalEmails,
        });
    } catch (error) {
        console.error("Error fetching rejected invoice emails:", error);
        res.status(500).send("Server error");
    }
};

// Create new rejected invoice email configuration
exports.create = async (req, res) => {
    try {
        const { accountID, emails } = req.body;

        console.info("Creating rejected invoice email config:", { accountID, emails });

        if (!accountID || !emails) {
            return res.status(400).json({
                success: false,
                message: "Account ID and emails are required"
            });
        }

        // Parse emails - can be comma-separated string or array
        let emailArray = [];
        if (typeof emails === 'string') {
            emailArray = emails.split(',').map(email => email.trim()).filter(email => email);
        } else if (Array.isArray(emails)) {
            emailArray = emails.filter(email => email && email.trim());
        }

        if (emailArray.length === 0) {
            return res.status(400).json({
                success: false,
                message: "At least one email is required"
            });
        }

        // Check if accountID already exists
        const db = mongoose.connection;
        const collection = db.collection("rejectedInvoiceEmails");
        const existingConfig = await collection.findOne({ accountID });

        if (existingConfig) {
            return res.status(400).json({
                success: false,
                message: "Configuration for this Account ID already exists"
            });
        }

        // Create new configuration
        const newConfig = {
            accountID,
            emails: emailArray,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await collection.insertOne(newConfig);
        console.info("Created rejected invoice email config:", result.insertedId);

        if (req.headers['content-type'] === 'application/json') {
            res.json({ success: true, message: "Configuration created successfully" });
        } else {
            res.redirect("/rejected-invoice-emails");
        }
    } catch (error) {
        console.error("Error creating rejected invoice email:", error);
        if (req.headers['content-type'] === 'application/json') {
            res.status(500).json({ success: false, message: "Server error" });
        } else {
            res.status(500).send("Server error");
        }
    }
};

// Update rejected invoice email configuration
exports.update = async (req, res) => {
    try {
        const { id } = req.params;
        const { accountID, emails } = req.body;

        console.info("Updating rejected invoice email config:", { id, accountID, emails });

        if (!accountID || !emails) {
            return res.status(400).json({
                success: false,
                message: "Account ID and emails are required"
            });
        }

        // Parse emails - can be comma-separated string or array
        let emailArray = [];
        if (typeof emails === 'string') {
            emailArray = emails.split(',').map(email => email.trim()).filter(email => email);
        } else if (Array.isArray(emails)) {
            emailArray = emails.filter(email => email && email.trim());
        }

        if (emailArray.length === 0) {
            return res.status(400).json({
                success: false,
                message: "At least one email is required"
            });
        }

        const db = mongoose.connection;
        const collection = db.collection("rejectedInvoiceEmails");

        // Check if accountID already exists for different document
        const existingConfig = await collection.findOne({
            accountID,
            _id: { $ne: new ObjectId(id) }
        });

        if (existingConfig) {
            return res.status(400).json({
                success: false,
                message: "Configuration for this Account ID already exists"
            });
        }

        // Update configuration
        const updateResult = await collection.updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    accountID,
                    emails: emailArray,
                    updatedAt: new Date()
                }
            }
        );

        if (updateResult.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Configuration not found"
            });
        }

        console.info("Updated rejected invoice email config:", updateResult);

        if (req.headers['content-type'] === 'application/json') {
            res.json({ success: true, message: "Configuration updated successfully" });
        } else {
            res.redirect("/rejected-invoice-emails");
        }
    } catch (error) {
        console.error("Error updating rejected invoice email:", error);
        if (req.headers['content-type'] === 'application/json') {
            res.status(500).json({ success: false, message: "Server error" });
        } else {
            res.status(500).send("Server error");
        }
    }
};

// Delete rejected invoice email configuration
exports.delete = async (req, res) => {
    try {
        const { id } = req.params;

        console.info("Deleting rejected invoice email config:", id);

        const db = mongoose.connection;
        const collection = db.collection("rejectedInvoiceEmails");

        const deleteResult = await collection.deleteOne({ _id: new ObjectId(id) });

        if (deleteResult.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Configuration not found"
            });
        }

        console.info("Deleted rejected invoice email config:", deleteResult);

        if (req.headers['content-type'] === 'application/json') {
            res.json({ success: true, message: "Configuration deleted successfully" });
        } else {
            res.redirect("/rejected-invoice-emails");
        }
    } catch (error) {
        console.error("Error deleting rejected invoice email:", error);
        if (req.headers['content-type'] === 'application/json') {
            res.status(500).json({ success: false, message: "Server error" });
        } else {
            res.status(500).send("Server error");
        }
    }
};

// Get single configuration for editing
exports.getById = async (req, res) => {
    try {
        const { id } = req.params;

        const db = mongoose.connection;
        const collection = db.collection("rejectedInvoiceEmails");

        const config = await collection.findOne({ _id: new ObjectId(id) });

        if (!config) {
            return res.status(404).json({
                success: false,
                message: "Configuration not found"
            });
        }

        res.json({ success: true, data: config });
    } catch (error) {
        console.error("Error getting rejected invoice email:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};