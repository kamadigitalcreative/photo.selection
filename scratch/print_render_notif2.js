const fs = require('fs');
const content = fs.readFileSync('app.html', 'utf8');

const idx = content.indexOf('let bgClass = isUnread');
console.log(content.slice(idx, idx + 2500));

