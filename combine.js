const fs = require('fs');
const path = require('path');

// Read patterns from .gitignore file
function loadGitignorePatterns() {
    const ignoreFile = path.join(process.cwd(), '.gitignore');
    if (!fs.existsSync(ignoreFile)) return [];
    
    return fs.readFileSync(ignoreFile, 'utf-8')
        .split('\n')
        .filter(line => line && !line.startsWith('#'))
        .map(pattern => pattern.trim());
}

// Check if a path should be ignored based on patterns
function isIgnoredPath(filePath, ignoredPatterns) {
    return ignoredPatterns.some(pattern => filePath.includes(pattern));
}

// Recursively gather all .js files not in ignored paths
function gatherJsFiles(dir, ignoredPatterns) {
    let jsFiles = [];
    
    fs.readdirSync(dir, { withFileTypes: true }).forEach(dirent => {
        const fullPath = path.join(dir, dirent.name);

        if (isIgnoredPath(fullPath, ignoredPatterns)) return;
        if (dirent.isDirectory()) {
            jsFiles = jsFiles.concat(gatherJsFiles(fullPath, ignoredPatterns));
        } else if (dirent.isFile() && fullPath.endsWith('.js') && !fullPath.endsWith('compile.js')) {
            jsFiles.push(fullPath);
        }
    });

    return jsFiles;
}

// Create a combined file with content of all .js files, bracketed by paths
function createCombinedFile(jsFiles, outputFile = 'all.txt') {
    const outputStream = fs.createWriteStream(outputFile, { flags: 'w' });

    jsFiles.forEach(jsFile => {
        const relativePath = path.relative(process.cwd(), jsFile).replace(/\\/g, '/');
        const bracketedPath = `<${relativePath}>`;
        outputStream.write(`${bracketedPath}\n`);

        const content = fs.readFileSync(jsFile, 'utf-8');
        outputStream.write(content);
        
        outputStream.write(`\n</${relativePath}>\n\n`);
    });

    outputStream.end();
    console.log(`Combined content written to ${outputFile}`);
}

// Main function
function main() {
    const ignoredPatterns = loadGitignorePatterns();
    ignoredPatterns.push('combine.js'); // Exclude this script file itself

    const jsFiles = gatherJsFiles(process.cwd(), ignoredPatterns);
    createCombinedFile(jsFiles);
}

main();
