function toCamelCase(str) {
    return str
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase());
  }
  
  function convertObjectToCamelCase(obj) {
    const newObj = {};
    for (let key in obj) {
      newObj[toCamelCase(key)] = obj[key];
    }
    return newObj;
  }
  
  module.exports = convertObjectToCamelCase;
  