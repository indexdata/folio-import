const mr = require(process.argv[2]);
let tags = [];

for (let tag in mr) {
	tags.push(tag);
}
let lines = [];
let h = 'MARC tag\tSubfields\tFOLIO field\tDescription\tProcessing Function';
lines.push(h);
tags.sort().forEach(t => {
	let rules = mr[t];
	rules.forEach(rule => {
		if (rule.entity) {
			rule.entity.forEach(e => {
				let sf = (e.subfield) ? e.subfield.join('') : ''; 
				let func = '';
				if (e.rules) {
					e.rules.forEach(r => {
						let funcs = [];
						if (r.conditions) {
							r.conditions.forEach(c => {
								funcs.push(JSON.stringify(c));
							});
						}
						func = funcs.join('; ');
					}); 
				}
				let targ = e.target;
				let desc = e.description;
				let line = `${t}\t${sf}\t${targ}\t${desc}\t${func}`;		
				lines.push(line);
			});
		} else {
			let sf = (rule.subfield) ? rule.subfield.join('') : '';
			let func = '';
			if (rule.rules) {
				rule.rules.forEach(r => {
					let funcs = [];
					if (r.conditions) {
						r.conditions.forEach(c => {
							funcs.push(JSON.stringify(c));
						});
					}
					func = funcs.join('; ');
				}); 
			}
			let targ = rule.target;
			let desc = rule.description; 
			let line = `${t}\t${sf}\t${targ}\t${desc}\t${func}`;		
			lines.push(line);
		}
	});
});
lines.forEach(l => {
	console.log(l);
});
