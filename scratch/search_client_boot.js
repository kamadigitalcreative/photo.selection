const fs = require('fs');
const html = fs.readFileSync('app.html', 'utf8');
const lines = html.split('\n');

console.log('--- Search Results ---');
lines.forEach((l, i) => {
  if (l.includes('clientState.token') || l.includes('simulateClientLink') || l.includes('exitClientPreview') || l.includes('URLSearchParams')) {
    console.log((i+1) + ': ' + l.trim().slice(0, 100));
  }
});
