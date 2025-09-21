const mongoose = require("mongoose");

const NoSchemaModel = mongoose.model("logRPA", new mongoose.Schema({}, { strict: false }), 'explicit_collection_name');
async function fetchLogs() {
    const logs = await NoSchemaModel.find().exec();
    return logs;
}

module.exports = fetchLogs;
