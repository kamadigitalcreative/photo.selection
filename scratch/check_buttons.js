const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const regex = /<(a|button)\b([^>]*)>/gi;
let m;
const buttons = [];
while ((m = regex.exec(html)) !== null) {
  const tagName = m[1];
  const attrs = m[2];
  const classMatch = attrs.match(/class=['"]([^'"]+)['"]/);
  const hrefMatch = attrs.match(/href=['"]([^'"]+)['"]/);
  const idMatch = attrs.match(/id=['"]([^'"]+)['"]/);
  buttons.push({
    tag: tagName,
    id: idMatch ? idMatch[1] : null,
    className: classMatch ? classMatch[1] : '',
    href: hrefMatch ? hrefMatch[1] : null
  });
}

console.log('Total a/button elements:', buttons.length);
buttons.forEach((b, i) => {
  if (b.className.includes('btn') || b.className.includes('cta') || b.className.includes('rounded') || b.tag === 'button') {
    console.log(`[${i+1}] <${b.tag}> id="${b.id || ''}" class="${b.className}" href="${b.href || ''}"`);
  }
});
