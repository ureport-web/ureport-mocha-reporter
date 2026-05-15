'use strict';
const fs = require('fs');

// Create a Mocha-compatible CJS entry that exports the class directly.
// Mocha's reporter loader does `require(path)` and uses the result as a constructor,
// so the module.exports must BE the class (not an ESM interop object).
const wrapper = `'use strict';
module.exports = require('./index.js').UReportMochaReporter;
`;

fs.writeFileSync('dist/cjs/mocha.js', wrapper);
console.log('postbuild: wrote dist/cjs/mocha.js');
