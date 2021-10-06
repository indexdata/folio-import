const mr = require(process.argv[2]);
let tags = [];

for (let tag in mr) {
	tags.push(tag);
}
let lines = [];
tags.sort().forEach(t => {
	let rules = mr[t];
	rules.forEach(rule => {
		if (rule.entity) {
			rule.entity.forEach(e => {
				let sf = (e.subfield) ? e.subfield.join('') : ''; 
				lines.push(`${t}\t${sf}\t${e.target}`);		
			});
		} else {
			let sf = (rule.subfield) ? rule.subfield.join('') : '';
			lines.push(`${t}\t${sf}\t${rule.target}`);		
		}
	});
});
lines.forEach(l => {
	console.log(l);
});
