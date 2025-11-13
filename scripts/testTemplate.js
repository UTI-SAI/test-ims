const xlsx = require('xlsx');
const path = require('path');

try {
    console.log('Testing Excel template...');

    const templatePath = path.join(__dirname, '../public/templates/email-settings-template.xlsx');
    console.log('Template path:', templatePath);

    // Try to read the Excel file
    const workbook = xlsx.readFile(templatePath);
    console.log('Workbook sheets:', workbook.SheetNames);

    // Test the main data sheet
    const dataSheet = workbook.Sheets['Email Settings'];
    if (dataSheet) {
        const jsonData = xlsx.utils.sheet_to_json(dataSheet, { header: 1 });
        console.log('Data sheet rows:', jsonData.length);
        console.log('Headers:', jsonData[0]);
        console.log('Sample data:', jsonData[1]);
    }

    // Test the instructions sheet
    const instructionsSheet = workbook.Sheets['Instructions'];
    if (instructionsSheet) {
        const instructionsData = xlsx.utils.sheet_to_json(instructionsSheet, { header: 1 });
        console.log('Instructions sheet rows:', instructionsData.length);
        console.log('First instruction:', instructionsData[0]);
    }

    console.log('✅ Excel template is valid and readable!');

} catch (error) {
    console.error('❌ Error reading Excel template:', error.message);
}