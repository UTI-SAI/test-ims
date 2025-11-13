const { parseExcelEmailSettings } = require('../helpers/parseExcelEmailSettings');
const path = require('path');

async function testParseTemplate() {
    try {
        console.log('Testing parser with simple Excel template...');

        const templatePath = path.join(__dirname, '../public/templates/email-settings-simple.xlsx');
        console.log('Testing file:', templatePath);

        // Test parsing the Excel template
        const result = parseExcelEmailSettings(templatePath);

        if (result.success) {
            console.log('✅ Parser successful!');
            console.log('✅ Records found:', result.total);
            console.log('✅ Errors:', result.errorCount);
            console.log('✅ Sample record:', JSON.stringify(result.data[0], null, 2));
        } else {
            console.error('❌ Parser failed:', result.error);
        }

        console.log('\nTesting CSV template...');
        const csvPath = path.join(__dirname, '../public/templates/email-settings-template.csv');
        const csvResult = parseExcelEmailSettings(csvPath);

        if (csvResult.success) {
            console.log('✅ CSV Parser successful!');
            console.log('✅ CSV Records found:', csvResult.total);
            console.log('✅ CSV Sample record:', JSON.stringify(csvResult.data[0], null, 2));
        } else {
            console.error('❌ CSV Parser failed:', csvResult.error);
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testParseTemplate();