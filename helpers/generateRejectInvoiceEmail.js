const fs = require('fs');
const path = require('path');

/**
 * Generate email content for rejected invoice notification
 * @param {Object} data - The data object containing invoice information
 * @param {string} data.documentNumber - Document reference number (e.g., "24Feb01326")
 * @param {Array} data.invoices - Array of invoice objects with clNumber, invoiceNumber, and reason
 * @returns {string} - HTML content for the email
 */
const generateRejectInvoiceEmail = (data) => {
    try {
        // Read the HTML template
        const templatePath = path.join(__dirname, '../public/static/html/reject-invoice.html');
        let htmlContent = fs.readFileSync(templatePath, 'utf8');

        // Replace document number
        htmlContent = htmlContent.replace('{DOCUMENT_NUMBER}', data.documentNumber || '');

        // Generate invoice list HTML with automatic numbering
        let invoiceListHtml = '';
        if (data.invoices && Array.isArray(data.invoices)) {
            data.invoices.forEach((invoice, index) => {
                // index + 1 akan menghasilkan nomor urut: 1, 2, 3, dst.
                const itemNumber = index + 1;
                invoiceListHtml += `
          <div class="invoice-item">
            ${itemNumber}. <span class="invoice-number">${invoice.invoiceNumber}</span>, 
            <span class="rejected-text">Rejected</span>. 
            <span class="reason">Reason : ${invoice.reason}</span>
          </div>
        `;
            });
        }

        // Replace invoice list placeholder
        htmlContent = htmlContent.replace('{INVOICE_LIST}', invoiceListHtml);

        return htmlContent;
    } catch (error) {
        console.error('Error generating reject invoice email:', error);
        return null;
    }
};

/**
 * Example usage:
 * const emailData = {
 *   documentNumber: "24Feb01326",
 *   invoices: [
 *     {
 *       clNumber: "C25XXX01",
 *       reason: "Wrong Amount"
 *     },
 *     {
 *       clNumber: "C25XXX03", 
 *       reason: "Wrong Description"
 *     },
 *     {
 *       clNumber: "C25XXX05", 
 *       reason: "Missing Documentation"
 *     }
 *   ]
 * };
 * 
 * const emailContent = generateRejectInvoiceEmail(emailData);
 * 
 * // Hasil output akan berisi:
 * // 1. C25XXX01, Rejected. Reason : Wrong Amount
 * // 2. C25XXX03, Rejected. Reason : Wrong Description  
 * // 3. C25XXX05, Rejected. Reason : Missing Documentation
 */

module.exports = {
    generateRejectInvoiceEmail
};