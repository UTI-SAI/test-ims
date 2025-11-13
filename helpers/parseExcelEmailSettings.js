const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

/**
 * Parse Excel/CSV file for rejected invoice email settings
 * Expected columns:
 * A: Customer ID -> maps to accountID
 * B: Account Holder Name (ignored)
 * C: Email Account Holder Name (ignored)
 * D: MAIN PIC CS -> email_main_pic
 * E: Email MAIN PIC CS -> email_main_pic
 * F: E-Mail Comm - TO -> email_comm
 * G: Commercial Manager -> email_comm_manager
 * H: E-Mail Commercial Manager - CC -> email_comm_manager
 * I: Email Milist Comercial - CC -> email_milist_com
 * J: Email Finance - CC -> email_finance
 */
function parseExcelEmailSettings(filePath) {
    try {
        const fileExt = path.extname(filePath).toLowerCase();
        let jsonData;

        if (fileExt === '.csv') {
            // Parse CSV file
            const csvContent = fs.readFileSync(filePath, 'utf8');
            const lines = csvContent.split('\n').filter(line => line.trim());

            if (lines.length < 2) {
                throw new Error('CSV file is empty or has no data rows');
            }

            // Parse CSV manually
            jsonData = lines.map(line => {
                // Simple CSV parsing (handles basic cases)
                return line.split(',').map(cell => cell.trim());
            });
        } else {
            // Read Excel file
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0]; // Get first sheet
            const worksheet = workbook.Sheets[sheetName];

            // Convert to JSON (with header row as keys)
            jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
        }

        if (jsonData.length < 2) {
            throw new Error('Excel file is empty or has no data rows');
        }

        // Get headers from first row
        const headers = jsonData[0];

        // Find column indices based on file type and headers
        let customerIdCol, emailMainPicCol, emailCommCol, emailCommManagerCol, emailMilistComCol, emailFinanceCol;

        // Check if it's the new template format (both CSV and new Excel use same format)
        const isNewFormat = headers.includes('accountID') && headers.includes('email_main_pic');

        if (isNewFormat || fileExt === '.csv') {
            // For new template format (CSV and new Excel)
            customerIdCol = 0; // accountID
            emailMainPicCol = 1; // email_main_pic
            emailCommCol = 2; // email_comm
            emailCommManagerCol = 3; // email_comm_manager
            emailMilistComCol = 4; // email_milist_com
            emailFinanceCol = 5; // email_finance
        } else {
            // For Excel legacy format (old structure)
            customerIdCol = 0; // Column A
            emailMainPicCol = 4; // Column E
            emailCommCol = 5; // Column F
            emailCommManagerCol = 7; // Column H
            emailMilistComCol = 8; // Column I
            emailFinanceCol = 9; // Column J
        }

        const results = [];
        const errors = [];

        // Process data rows (skip header row)
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];

            // Skip empty rows
            if (!row || row.length === 0 || !row[customerIdCol]) {
                continue;
            }

            const accountID = String(row[customerIdCol]).trim();

            // Skip if accountID is empty
            if (!accountID) {
                errors.push({
                    row: i + 1,
                    error: 'Customer ID is empty'
                });
                continue;
            }

            // Extract emails (support multiple emails with semicolon delimiter)
            const emailConfig = {
                accountID: accountID,
                email_main_pic: extractEmail(row[emailMainPicCol]) || [],
                email_comm: extractEmail(row[emailCommCol]) || [],
                email_comm_manager: extractEmail(row[emailCommManagerCol]) || [],
                email_milist_com: extractEmail(row[emailMilistComCol]) || [],
                email_finance: extractEmail(row[emailFinanceCol]) || []
            };

            // Check if at least one email is provided
            const hasEmail = emailConfig.email_main_pic.length > 0 ||
                emailConfig.email_comm.length > 0 ||
                emailConfig.email_comm_manager.length > 0 ||
                emailConfig.email_milist_com.length > 0 ||
                emailConfig.email_finance.length > 0;

            if (!hasEmail) {
                errors.push({
                    row: i + 1,
                    accountID: accountID,
                    error: 'No email addresses found'
                });
                continue;
            }

            results.push(emailConfig);
        }

        return {
            success: true,
            data: results,
            errors: errors,
            total: results.length,
            errorCount: errors.length
        };

    } catch (error) {
        console.error('Error parsing Excel file:', error);
        return {
            success: false,
            error: error.message,
            data: [],
            errors: []
        };
    }
}

/**
 * Extract emails from cell value (now supports multiple emails)
 * Handles cases where cell contains both name and email, and multiple emails
 * Examples:
 * - "tiar.agisti@gmail.com" -> ["tiar.agisti@gmail.com"]
 * - "tiar@gmail.com; john@gmail.com" -> ["tiar@gmail.com", "john@gmail.com"]
 * - "John Doe <john@example.com>; Jane <jane@example.com>" -> ["john@example.com", "jane@example.com"]
 */
function extractEmail(cellValue) {
    if (!cellValue) return [];

    const value = String(cellValue).trim();
    if (!value) return [];

    // Split by semicolon first to handle multiple emails
    const emailParts = value.split(';').map(part => part.trim()).filter(part => part);
    const extractedEmails = [];

    for (const part of emailParts) {
        // Check if part contains email pattern
        const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
        const matches = part.match(emailRegex);

        if (matches && matches.length > 0) {
            // Add all emails found in this part
            matches.forEach(email => {
                const cleanEmail = email.toLowerCase().trim();
                if (cleanEmail && !extractedEmails.includes(cleanEmail)) {
                    extractedEmails.push(cleanEmail);
                }
            });
        } else if (part.includes('@')) {
            // If no regex match but contains @, try to use it as email
            const cleanEmail = part.toLowerCase().trim();
            if (cleanEmail && !extractedEmails.includes(cleanEmail)) {
                extractedEmails.push(cleanEmail);
            }
        }
    }

    return extractedEmails;
}

/**
 * Validate email format
 */
function isValidEmail(email) {
    if (!email) return false;
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+$/;
    return emailRegex.test(email);
}

module.exports = {
    parseExcelEmailSettings,
    extractEmail,
    isValidEmail
};
