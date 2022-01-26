let schema;
try {
	schema = require(process.argv[2]);
} catch (e) {
	schema = require('./' + process.argv[2]);
}

const req = {};
if (schema.required) {
	schema.required.forEach(r => {
		req[r] = 1;
	});
}

const makeLines = (props, parent, parLabel) => {
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
		let fobject = p;
		if (parent) {
			fobject = `${parent}.${p}`;
			label = `${parLabel} > ${label}`
		}
		let line = `${label}\t${fobject}\t${r}\t${desc}\t${choices}\t${prop.type}`;
		if (prop.description && !prop.description.match(/Deprecated/i)) {
			console.log(line);
			if (prop.properties) {
				makeLines(prop.properties, p, label);
			}
			if (prop.items && prop.items.properties) {
				makeLines(prop.items.properties, p, label);
			} 
		}
	}
}

const props = schema.properties || [ schema ];

console.log(`Folio field\tFolio object\tRequired\tDescription\tChoices\tValue type\tSource field (MARC or other)\tNotes`);
makeLines(props)