const fs = require('fs');
const tranFile = process.argv[2];
const stepFile = process.argv[3];

if (!stepFile) throw('Usage: getXslt.js <transformation_file> <steps_file>');

let stepStr = fs.readFileSync(stepFile, { encoding: 'utf8' });
const steps = {};
let sa = stepStr.split(/\n/);
sa.pop();
sa.forEach(l => {
	let s = JSON.parse(l);
	let id = s.id;
	let xsl = s.script;
	steps[id] = xsl;
});
let tranStr = fs.readFileSync(tranFile, { encoding: 'utf8' });
let tran = JSON.parse(tranStr);

let i = 0;
tran.steps.forEach(s => {
	i++;
	let id = s.id;
	let st = steps[id];
	let fn = `${i}-${s.name}.xsl`;
	console.log(`Writing XSLT to ${fn}`);
	fs.writeFileSync(fn, st);
});
