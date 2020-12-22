const inFolio = process.argv[2];
const usersFile = process.argv[3];

if (!usersFile) throw new Error('Usage: usersCompare <folio users> <new users>');

console.warn('Loading folio users...');
let ufolio = require(inFolio);
delete require.cache[require.resolve(inFolio)];

console.warn('Building map...');
bcmap = {};
ufolio.users.forEach(u => {
	bcmap[u.barcode] = u.id
});

ufolio = {};

console.warn('Loading users file...');
let users = require(usersFile);
console.warn('Scanning users file...');
let out = { users: [] };
let ttl = 0;
users.users.forEach(u => {
	if (!bcmap[u.barcode]) {
		out.users.push(u);
		ttl++;
	}
});
out.totalRecords = ttl;
console.log(JSON.stringify(out, null, 2));
