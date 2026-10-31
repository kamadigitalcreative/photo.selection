const fs = require('fs');
const css = fs.readFileSync('assets/css/role-shell.css', 'utf8');

console.log('Includes modalNotification:', css.includes('modalNotification'));
console.log('Includes modalNotifContent:', css.includes('modalNotifContent'));
console.log('Includes notif-container:', css.includes('notif-container'));

