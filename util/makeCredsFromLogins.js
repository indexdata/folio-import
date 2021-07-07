const uFile = process.argv[3];
const lFile = process.argv[2];

if (!uFile) throw new Error('Usage: <logins.json> <users.json>');

console.warn('Loading users file...');
let users = require(uFile);
const uMap = {};
users.forEach(u => {
	if (u.username) uMap[u.id] = { username: u.username, barcode: u.barcode };  
});

let logins = require(lFile);
logins.forEach(l => {
	let uid = l.userId;
	let un = uMap[uid];
	if (un && !un.username.match(/pub-sub|admin/)) {
		let cred = { userId: uid, username: un.username, password: un.barcode };
		console.log(JSON.stringify(cred));
	}
});
