const XLSX = require('xlsx');
const path = require('path');

// Create sample data for the Excel template
const sampleData = [
    {
        accountID: 'SAMPLE001',
        email_main_pic: 'mainpic1@company.com;mainpic2@company.com',
        email_comm: 'communication@company.com',
        email_comm_manager: 'manager1@company.com;manager2@company.com',
        email_milist_com: 'mailinglist@company.com',
        email_finance: 'finance1@company.com;finance2@company.com'
    },
    {
        accountID: 'SAMPLE002',
        email_main_pic: 'pic@example.com',
        email_comm: 'comm@example.com;support@example.com',
        email_comm_manager: 'commmanager@example.com',
        email_milist_com: 'list@example.com;newsletter@example.com',
        email_finance: 'finance@example.com'
    }
];

// Create workbook and worksheet
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(sampleData);

// Set column widths
const columnWidths = [
    { wch: 15 }, // accountID
    { wch: 40 }, // email_main_pic
    { wch: 40 }, // email_comm
    { wch: 40 }, // email_comm_manager
    { wch: 40 }, // email_milist_com
    { wch: 40 }  // email_finance
];
ws['!cols'] = columnWidths;

// Add notes to header row
const headerNotes = {
    'A1': { c: [{ a: 'System', t: 'Account ID must be unique and not empty' }] },
    'B1': { c: [{ a: 'System', t: 'Multiple emails separated by semicolon (;)' }] },
    'C1': { c: [{ a: 'System', t: 'Multiple emails separated by semicolon (;)' }] },
    'D1': { c: [{ a: 'System', t: 'Multiple emails separated by semicolon (;)' }] },
    'E1': { c: [{ a: 'System', t: 'Multiple emails separated by semicolon (;)' }] },
    'F1': { c: [{ a: 'System', t: 'Multiple emails separated by semicolon (;)' }] }
};

// Add comments to cells
Object.keys(headerNotes).forEach(cell => {
    if (!ws[cell]) ws[cell] = {};
    ws[cell].c = headerNotes[cell].c;
});

// Add worksheet to workbook
XLSX.utils.book_append_sheet(wb, ws, 'Email Settings');

// Create instructions sheet
const instructions = [
    ['Email Settings Import Template - Instructions'],
    [''],
    ['How to use this template:'],
    ['1. Fill in the Account ID column (must be unique)'],
    ['2. Enter email addresses in the respective columns'],
    ['3. For multiple emails in one field, separate them with semicolons (;)'],
    ['4. Example: email1@domain.com;email2@domain.com;email3@domain.com'],
    ['5. Save the file and upload it through the bulk import feature'],
    [''],
    ['Column Descriptions:'],
    ['• accountID: Unique identifier for the account/customer'],
    ['• email_main_pic: Main Person in Charge email addresses'],
    ['• email_comm: Communication team email addresses'],
    ['• email_comm_manager: Communication manager email addresses'],
    ['• email_milist_com: Mailing list communication emails'],
    ['• email_finance: Finance department email addresses'],
    [''],
    ['Important Notes:'],
    ['• All email addresses will be validated'],
    ['• Empty emails will be ignored'],
    ['• Duplicate account IDs will cause import errors'],
    ['• Maximum file size: 50MB']
];

const instructionsWS = XLSX.utils.aoa_to_sheet(instructions);
instructionsWS['!cols'] = [{ wch: 60 }];

// Style the title row
instructionsWS['A1'].s = {
    font: { bold: true, sz: 14 },
    alignment: { horizontal: 'center' }
};

XLSX.utils.book_append_sheet(wb, instructionsWS, 'Instructions');

// Write file
const templatePath = path.join(__dirname, '../public/templates/email-settings-template.xlsx');
XLSX.writeFile(wb, templatePath);

console.log('Excel template generated successfully at:', templatePath);