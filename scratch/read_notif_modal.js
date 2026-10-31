const fs = require('fs');
const content = fs.readFileSync('app.html', 'utf8');
const idx = content.indexOf('id="modalNotification"');
console.log(content.slice(idx, idx + 4000));

