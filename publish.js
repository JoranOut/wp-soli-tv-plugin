const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Step 1: Delete any existing .zip files in the main directory
const files = fs.readdirSync(__dirname);
files.forEach(file => {
    if (path.extname(file) === '.zip') {
        fs.unlinkSync(path.join(__dirname, file));
        console.log(`Deleted existing zip file: ${file}`);
    }
});

// Step 2a: Read the README.md file
const readmeContent = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');

// Step 2b: Extract Plugin Name using regex
const pluginNameMatch = readmeContent.match(/~Plugin Name:\s*(.+?)~/);

if (!pluginNameMatch) {
    throw new Error('Could not find Plugin Name in README.md');
}

const pluginName = pluginNameMatch[1].trim();

// Step 3: Read .zipignore file for exclusion patterns
const zipignorePath = path.join(__dirname, '.zipignore');
let ignorePatterns = [];

if (fs.existsSync(zipignorePath)) {
    const zipignoreContent = fs.readFileSync(zipignorePath, 'utf8');
    ignorePatterns = zipignoreContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
}

const zipFileName = `${pluginName}.zip`;
const outputFilePath = path.join(__dirname, zipFileName);

const output = fs.createWriteStream(outputFilePath);
const archive = archiver('zip', { zlib: { level: 9 } });

// Log result
output.on('close', () => {
    console.log('---------------------------------');
    console.log('BUILD SUCCESSFUL');
    console.log(`${archive.pointer()} total bytes`);
    console.log(`${zipFileName} has been created`);
    console.log('---------------------------------');
});

archive.on('error', function(err) {
    throw err;
});

archive.on('entry', function(entry) {
    console.log(`Archiving file: ${entry.name}`);
});

archive.pipe(output);

// Zip with exclusions from .zipignore
archive.glob('**/*', {
    cwd: __dirname,
    ignore: ignorePatterns
});

archive.finalize();
