const schema = require(process.argv[2]);
const props = schema.properties;

const req = {};
if (schema.required) {
	schema.required.forEach(r => {
		req[r] = 1;
	});
}

console.log(`Folio field\tFolio object\tRequired\tDescription\tChoices\tValue type\tSource field (MARC or other)\tNotes`);
for (p in props) {
	let r = 'FALSE';
	if (req[p]) r = 'TRUE';
	let prop = props[p];
	let desc = prop.description || '';
	desc = desc.replace(/^./, (match) => { return match.toUpperCase() });
	let label = p.replace(/([A-Z])/g, ' $1'); 	
	label = label.toLowerCase();
	label = label.replace(/^./, (match) => { return match.toUpperCase() });
	let choices = '';
	if (prop.enum) {
		choices = prop.enum.join(', ');
	}
	let line = `${label}\t${p}\t${r}\t${desc}\t${choices}\t${prop.type}`;
	if (prop.description) console.log(line);
}
