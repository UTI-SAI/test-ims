const mongoose = require('mongoose');

const rejectedInvoiceEmailSchema = new mongoose.Schema({
    accountID: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email_main_pic: [{
        type: String,
        trim: true,
        validate: {
            validator: function (email) {
                return !email || /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email);
            },
            message: 'Please enter a valid email address for Main PIC'
        }
    }],
    email_comm: [{
        type: String,
        trim: true,
        validate: {
            validator: function (email) {
                return !email || /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email);
            },
            message: 'Please enter a valid email address for Communication'
        }
    }],
    email_comm_manager: [{
        type: String,
        trim: true,
        validate: {
            validator: function (email) {
                return !email || /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email);
            },
            message: 'Please enter a valid email address for Communication Manager'
        }
    }],
    email_milist_com: [{
        type: String,
        trim: true,
        validate: {
            validator: function (email) {
                return !email || /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email);
            },
            message: 'Please enter a valid email address for Mailing List Communication'
        }
    }],
    email_finance: [{
        type: String,
        trim: true,
        validate: {
            validator: function (email) {
                return !email || /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email);
            },
            message: 'Please enter a valid email address for Finance'
        }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt field before saving
rejectedInvoiceEmailSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('RejectedInvoiceEmail', rejectedInvoiceEmailSchema, 'rejectedInvoiceEmails');