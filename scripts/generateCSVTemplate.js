const fs = require('fs');
const path = require('path');

try {
    // Create CSV content
    const csvHeader = 'accountID,email_main_pic,email_comm,email_comm_manager,email_milist_com,email_finance\n';
    const csvSample1 = 'SAMPLE001,mainpic1@company.com;mainpic2@company.com,communication@company.com,manager1@company.com;manager2@company.com,mailinglist@company.com,finance1@company.com;finance2@company.com\n';
    const csvSample2 = 'SAMPLE002,pic@example.com,comm@example.com;support@example.com,commmanager@example.com,list@example.com;newsletter@example.com,finance@example.com\n';

    const csvContent = csvHeader + csvSample1 + csvSample2;

    // Ensure directory exists
    const templateDir = path.join(__dirname, '../public/templates');
    if (!fs.existsSync(templateDir)) {
        fs.mkdirSync(templateDir, { recursive: true });
    }

    // Write CSV file
    const csvPath = path.join(templateDir, 'email-settings-template.csv');
    fs.writeFileSync(csvPath, csvContent, 'utf8');

    console.log('CSV template generated successfully at:', csvPath);
} catch (error) {
    console.error('Error generating CSV template:', error);
    process.exit(1);
}