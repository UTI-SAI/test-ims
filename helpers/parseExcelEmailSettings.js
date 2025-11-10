const xlsx = require('xlsx');

/**
 * Parse Excel file for rejected invoice email settings
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
        // Read Excel file
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0]; // Get first sheet
        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON (with header row as keys)
        const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length < 2) {
            throw new Error('Excel file is empty or has no data rows');
        }

        // Get headers from first row
        const headers = jsonData[0];

        // Find column indices
        const customerIdCol = 0; // Column A
        const emailMainPicCol = 4; // Column E
        const emailCommCol = 5; // Column F
        const emailCommManagerCol = 7; // Column H
        const emailMilistComCol = 8; // Column I
        const emailFinanceCol = 9; // Column J

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

            // Extract emails (only take email addresses, ignore names)
            const emailConfig = {
                accountID: accountID,
                email_main_pic: extractEmail(row[emailMainPicCol]) || '',
                email_comm: extractEmail(row[emailCommCol]) || '',
                email_comm_manager: extractEmail(row[emailCommManagerCol]) || '',
                email_milist_com: extractEmail(row[emailMilistComCol]) || '',
                email_finance: extractEmail(row[emailFinanceCol]) || ''
            };

            // Check if at least one email is provided
            const hasEmail = emailConfig.email_main_pic ||
                emailConfig.email_comm ||
                emailConfig.email_comm_manager ||
                emailConfig.email_milist_com ||
                emailConfig.email_finance;

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
 * Extract email from cell value
 * Handles cases where cell contains both name and email
 * Examples:
 * - "tiar.agisti@gmail.com" -> "tiar.agisti@gmail.com"
 * - "John Doe <john@example.com>" -> "john@example.com"
 * - Multiple emails separated by comma or semicolon -> take first one
 */
function extractEmail(cellValue) {
    if (!cellValue) return '';

    const value = String(cellValue).trim();
    if (!value) return '';

    // Check if value contains email pattern
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
    const matches = value.match(emailRegex);

    if (matches && matches.length > 0) {
        // Return first email found
        return matches[0].toLowerCase();
    }

    // If no email pattern found, return original value if it looks like an email
    if (value.includes('@')) {
        return value.toLowerCase();
    }

    return '';
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
