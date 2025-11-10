const moment = require("moment");
const ObjectId = require("mongodb").ObjectId;
const mongoose = require("mongoose");
const { createQueryString } = require("../helpers/createQueryString");
const RejectedInvoiceEmail = require("../models/RejectedInvoiceEmail");
const { parseExcelEmailSettings } = require("../helpers/parseExcelEmailSettings");
const fs = require("fs");

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
            query.$or = [
                { email_main_pic: { $regex: email, $options: "i" } },
                { email_comm: { $regex: email, $options: "i" } },
                { email_comm_manager: { $regex: email, $options: "i" } },
                { email_milist_com: { $regex: email, $options: "i" } },
                { email_finance: { $regex: email, $options: "i" } }
            ];
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
        const {
            accountID,
            email_main_pic,
            email_comm,
            email_comm_manager,
            email_milist_com,
            email_finance
        } = req.body;

        console.info("Creating rejected invoice email config:", {
            accountID,
            email_main_pic,
            email_comm,
            email_comm_manager,
            email_milist_com,
            email_finance
        });

        if (!accountID) {
            return res.status(400).json({
                success: false,
                message: "Account ID is required"
            });
        }

        // At least one email should be provided
        if (!email_main_pic && !email_comm && !email_comm_manager && !email_milist_com && !email_finance) {
            return res.status(400).json({
                success: false,
                message: "At least one email address is required"
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
            email_main_pic: email_main_pic || "",
            email_comm: email_comm || "",
            email_comm_manager: email_comm_manager || "",
            email_milist_com: email_milist_com || "",
            email_finance: email_finance || "",
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
        const {
            accountID,
            email_main_pic,
            email_comm,
            email_comm_manager,
            email_milist_com,
            email_finance
        } = req.body;

        console.info("Updating rejected invoice email config:", {
            id,
            accountID,
            email_main_pic,
            email_comm,
            email_comm_manager,
            email_milist_com,
            email_finance
        });

        if (!accountID) {
            return res.status(400).json({
                success: false,
                message: "Account ID is required"
            });
        }

        // At least one email should be provided
        if (!email_main_pic && !email_comm && !email_comm_manager && !email_milist_com && !email_finance) {
            return res.status(400).json({
                success: false,
                message: "At least one email address is required"
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
                    email_main_pic: email_main_pic || "",
                    email_comm: email_comm || "",
                    email_comm_manager: email_comm_manager || "",
                    email_milist_com: email_milist_com || "",
                    email_finance: email_finance || "",
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

// Bulk import from Excel file
exports.bulkImport = async (req, res) => {
    try {
        console.info("=== BULK IMPORT EMAIL SETTINGS STARTED ===");

        // Check if file was uploaded
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded"
            });
        }

        const filePath = req.file.path;
        console.info("File uploaded:", filePath);

        // Parse Excel file
        const parseResult = parseExcelEmailSettings(filePath);
        console.info("Parse result:", {
            success: parseResult.success,
            total: parseResult.total,
            errorCount: parseResult.errorCount
        });

        if (!parseResult.success) {
            // Clean up uploaded file
            fs.unlinkSync(filePath);
            return res.status(400).json({
                success: false,
                message: parseResult.error
            });
        }

        if (parseResult.data.length === 0) {
            // Clean up uploaded file
            fs.unlinkSync(filePath);
            return res.status(400).json({
                success: false,
                message: "No valid data found in Excel file",
                errors: parseResult.errors
            });
        }

        const db = mongoose.connection;
        const collection = db.collection("rejectedInvoiceEmails");

        const results = {
            inserted: 0,
            updated: 0,
            skipped: 0,
            errors: [...parseResult.errors]
        };

        // Process each record
        for (let i = 0; i < parseResult.data.length; i++) {
            const emailConfig = parseResult.data[i];

            try {
                // Check if accountID already exists
                const existingConfig = await collection.findOne({
                    accountID: emailConfig.accountID
                });

                if (existingConfig) {
                    // Update existing configuration
                    const updateResult = await collection.updateOne(
                        { accountID: emailConfig.accountID },
                        {
                            $set: {
                                email_main_pic: emailConfig.email_main_pic,
                                email_comm: emailConfig.email_comm,
                                email_comm_manager: emailConfig.email_comm_manager,
                                email_milist_com: emailConfig.email_milist_com,
                                email_finance: emailConfig.email_finance,
                                updatedAt: new Date()
                            }
                        }
                    );

                    if (updateResult.modifiedCount > 0) {
                        results.updated++;
                        console.info(`Updated: ${emailConfig.accountID}`);
                    } else {
                        results.skipped++;
                        console.info(`Skipped (no changes): ${emailConfig.accountID}`);
                    }
                } else {
                    // Insert new configuration
                    const newConfig = {
                        ...emailConfig,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };

                    await collection.insertOne(newConfig);
                    results.inserted++;
                    console.info(`Inserted: ${emailConfig.accountID}`);
                }
            } catch (error) {
                console.error(`Error processing ${emailConfig.accountID}:`, error);
                results.errors.push({
                    accountID: emailConfig.accountID,
                    error: error.message
                });
            }
        }

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        console.info("=== BULK IMPORT COMPLETED ===");
        console.info("Results:", results);

        res.json({
            success: true,
            message: "Bulk import completed",
            results: results
        });

    } catch (error) {
        console.error("Error in bulk import:", error);

        // Clean up uploaded file if exists
        if (req.file && req.file.path) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkError) {
                console.error("Error deleting file:", unlinkError);
            }
        }

        res.status(500).json({
            success: false,
            message: "Server error during bulk import",
            error: error.message
        });
    }
};