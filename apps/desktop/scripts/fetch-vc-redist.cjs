const fs = require('node:fs');
const path = require('node:path');

const dest = path.join(__dirname, '..', 'build', 'vc_redist.x64.exe');
const url = 'https://aka.ms/vs/17/release/vc_redist.x64.exe';

async function main() {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 10_000_000) return;
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`vc_redist download failed: ${res.status}`);
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    console.log(`vc_redist.x64.exe téléchargé (${fs.statSync(dest).size} octets)`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
