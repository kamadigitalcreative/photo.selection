const fs = require('fs');

const html = fs.readFileSync('app.html', 'utf8');
const sc = (html.match(/<script\b/gi) || []).length;
const ct = (html.match(/id:\s*['"]template-[^'"]+['"]/g) || []).length;
const sf = (html.match(/folder\.subfolders\s*=\s*0/g) || []).length;

console.log({ scripts: sc, templates: ct, subfolders: sf });
