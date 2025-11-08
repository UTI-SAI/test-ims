const mongoose = require('mongoose');

const rejectedInvoiceEmailSchema = new mongoose.Schema({
    accountID: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    emails: [{
        type: String,
        required: true,
        trim: true,
        validate: {
            validator: function (email) {
                return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email);
            },
            message: 'Please enter a valid email address'
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