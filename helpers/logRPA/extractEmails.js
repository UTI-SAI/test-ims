const extractEmails = (str) => {
    const regex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    return str.match(regex) || [];
};

module.exports = extractEmails;
  