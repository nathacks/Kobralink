const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function sign(target, deep = false) {
    execFileSync('codesign', ['--force', ...(deep ? ['--deep'] : []), '--sign', '-', target], { stdio: 'inherit' });
}

function signNativeBinaries(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) signNativeBinaries(full);
        else if (/\.(node|dylib|so)$/.test(entry.name)) sign(full);
    }
}

module.exports = async function afterSign(context) {
    if (context.electronPlatformName !== 'darwin') return;
    if (process.env.CSC_LINK || process.env.CSC_NAME) return;
    const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
    signNativeBinaries(path.join(appPath, 'Contents', 'Resources'));
    const frameworks = path.join(appPath, 'Contents', 'Frameworks');
    for (const entry of fs.readdirSync(frameworks)) sign(path.join(frameworks, entry), true);
    sign(appPath);
};
