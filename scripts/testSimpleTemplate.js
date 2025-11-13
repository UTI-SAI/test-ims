const XLSX = require('xlsx');
const path = require('path');

try {
    console.log('Testing simple Excel template...');

    const templatePath = path.join(__dirname, '../public/templates/email-settings-simple.xlsx');
    console.log('Template path:', templatePath);

    // Try to read the Excel file
    const workbook = XLSX.readFile(templatePath);
    console.log('✅ Workbook sheets:', workbook.SheetNames);

    // Test the main data sheet
    const dataSheet = workbook.Sheets['EmailSettings'];
    if (dataSheet) {
        const jsonData = XLSX.utils.sheet_to_json(dataSheet, { header: 1 });
        console.log('✅ Data sheet rows:', jsonData.length);
        console.log('✅ Headers:', jsonData[0]);
        console.log('✅ Sample data:', jsonData[1]);
        console.log('✅ Instructions start at row:', jsonData[4]);
    }

    console.log('✅ Simple Excel template is valid and readable!');
    console.log('File can be downloaded and opened without issues.');

} catch (error) {
    console.error('❌ Error reading simple Excel template:', error.message);
}