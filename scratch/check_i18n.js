const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const matches = [...html.matchAll(/data-i18n=['"]([^'"]+)['"]/g)].map(m => m[1]);
const uniqueKeys = [...new Set(matches)];

const dictStart = html.indexOf('const I18N_DICT = {');
const dictEnd = html.indexOf('function changeLandingLanguage');
const dictCode = html.slice(dictStart, dictEnd);

const fn = new Function(dictCode + '; return I18N_DICT;');
const I18N_DICT = fn();

console.log('Total unique data-i18n keys:', uniqueKeys.length);
const missingInId = uniqueKeys.filter(k => I18N_DICT.id[k] === undefined);
const missingInEn = uniqueKeys.filter(k => I18N_DICT.en[k] === undefined);

console.log('Missing in id:', missingInId);
console.log('Missing in en:', missingInEn);
