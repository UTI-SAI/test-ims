const fs = require("fs").promises;
const path = require("path");

const listFilesInDirectory = async (relativeOrAbsolutePath) => {
  try {
    const fullPath = path.isAbsolute(relativeOrAbsolutePath)
      ? relativeOrAbsolutePath
      : path.join(process.cwd(), relativeOrAbsolutePath);

    const files = await fs.readdir(fullPath);
    const fileDetails = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(fullPath, file);
        const stats = await fs.stat(filePath);
        return {
          name: file,
          addedDate: stats.mtime,
        };
      })
    );
    return fileDetails;
  } catch (err) {
    console.error("Error reading directory:", err);
  }

  return [];
};

module.exports = listFilesInDirectory;
