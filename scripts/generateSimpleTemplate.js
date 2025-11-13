const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

try {
    console.log('Creating simplified Excel template...');

    // Create a very simple workbook
    const wb = XLSX.utils.book_new();

    // Create sample data with simple format
    const data = [
        ['accountID', 'email_main_pic', 'email_comm', 'email_comm_manager', 'email_milist_com', 'email_finance'],
        ['SAMPLE001', 'mainpic1@company.com;mainpic2@company.com', 'communication@company.com', 'manager1@company.com;manager2@company.com', 'mailinglist@company.com', 'finance1@company.com;finance2@company.com'],
        ['SAMPLE002', 'pic@example.com', 'comm@example.com;support@example.com', 'commmanager@example.com', 'list@example.com;newsletter@example.com', 'finance@example.com'],
        ['', '', '', '', '', ''],
        ['Instructions:', '', '', '', '', ''],
        ['1. Fill accountID with unique identifier', '', '', '', '', ''],
        ['2. For multiple emails, use semicolon (;)', '', '', '', '', ''],
        ['3. Example: email1@domain.com;email2@domain.com', '', '', '', '', '']
    ];

    // Create worksheet from array of arrays
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Set column widths
    ws['!cols'] = [
        { wch: 15 },
        { wch: 35 },
        { wch: 35 },
        { wch: 35 },
        { wch: 35 },
        { wch: 35 }
    ];

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'EmailSettings');

    // Ensure directory exists
    const templateDir = path.join(__dirname, '../public/templates');
    if (!fs.existsSync(templateDir)) {
        fs.mkdirSync(templateDir, { recursive: true });
    }

    // Write file with compression disabled to avoid corruption
    const templatePath = path.join(templateDir, 'email-settings-simple.xlsx');
    XLSX.writeFile(wb, templatePath, { compression: false });

    console.log('✅ Simple Excel template created at:', templatePath);

    // Test if we can read it back
    const testWb = XLSX.readFile(templatePath);
    console.log('✅ Template verified - sheets:', testWb.SheetNames);

} catch (error) {
    console.error('❌ Error creating template:', error);
}