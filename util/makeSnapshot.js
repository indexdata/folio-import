const uuid = require('uuid/v5');
const fs = require('fs');

const ns = '11d09fb3-7d46-4a2d-8c97-2b82a27ef7b7';
let outFile = process.argv[2];

try {
  if (!outFile) throw 'Usage: node makeSnapshot.js <output_path>';
  let now = new Date().toISOString();
  now = now.replace(/Z.*/, '+0000');
  const out = {
    jobExecutionId: uuid(now, ns),
    status: 'COMMITTED',
    processingStartedDate: now
  }
  fs.writeFileSync(outFile, JSON.stringify(out) + '\n');
  console.log('1 snapshot successfully created!')
} catch (e) {
  console.error(e.message);
}