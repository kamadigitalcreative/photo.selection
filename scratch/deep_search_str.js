const fs = require('fs');

function searchString(str) {
  function walk(dir) {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const full = dir + '/' + file;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (file !== 'node_modules') walk(full);
      } else {
        try {
          const text = fs.readFileSync(full, 'utf8');
          if (text.includes(str)) {
            console.log('Found "' + str + '" in:', full);
          }
        } catch (_) {}
      }
    });
  }
  walk('.');
}

searchString('Fitur Lonceng Notifikasi');
searchString('Sistem Diperbarui');
searchString('Tampilan lebih clean');
console.log('Search finished.');

