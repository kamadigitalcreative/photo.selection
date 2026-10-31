const fs = require('fs');
const content = fs.readFileSync('app.html', 'utf8');

function findFn(fnName) {
  let idx = 0;
  while ((idx = content.indexOf(fnName, idx)) !== -1) {
    console.log(`${fnName} at ${idx}:`);
    console.log(content.slice(Math.max(0, idx - 40), idx + 1000));
    console.log('---');
    idx += fnName.length;
  }
}

findFn('switchNotifTab');
findFn('notif-container');

