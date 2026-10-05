const fs = require('fs');
let code = fs.readFileSync('src/ShortsEditor.tsx', 'utf8');
code = code.replace(/\\`/g, '`');
code = code.replace(/\\\$/g, '$');
fs.writeFileSync('src/ShortsEditor.tsx', code);
