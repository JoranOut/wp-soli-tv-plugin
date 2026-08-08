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

// Step 2a: Read the readme.md file
const readmeContent = fs.readFileSync(path.join(__dirname, 'readme.md'), 'utf8');

// Step 2b: Extract Plugin Name and Current Version using regex
const pluginNameMatch = readmeContent.match(/~Plugin Name:\s*(.+?)~/);

if (!pluginNameMatch) {
    throw new Error('Could not find Plugin Name or Current Version in readme.md');
}

const pluginName = pluginNameMatch[1].trim();

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
    console.log('Archive has been finalized and the output file descriptor has closed.');
});

archive.on('error', function(err) {
    throw err;
});

output.on('close', function() {
    console.log(`${archive.pointer()} total bytes`);
});

archive.on('entry', function(entry) {
    console.log(`Archiving file: ${entry.name}`);
});

archive.on('progress', function(progress) {
    console.log(`Progress: ${progress.entries.processed} files processed, ${progress.fs.processedBytes} bytes written`);
});

archive.pipe(output);

// Zip ignore
archive.glob('**/*', {
    cwd: __dirname,
    ignore: [
        'node_modules/**',
        '**/node_modules/**',
        'package.json',
        'package-lock.json',
        '**/package.json',
        '**/package-lock.json',
        '**/src/**',
        '**/webpack.config.js',
        '.wp-env.json',
        '.gitignore',
        '*.zip',
        'publish.js',
    ]
});

archive.finalize();
