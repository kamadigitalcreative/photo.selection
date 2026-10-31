const fs = require('fs');
const content = fs.readFileSync('app.html', 'utf8');

const idx = content.indexOf('function renderNotifList');
console.log(content.slice(idx, idx + 3500));

