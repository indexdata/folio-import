const permsFile = process.argv[2];
const bigPermsFile = process.argv[3];

const perms = require(permsFile);
let bigPerms = [];
if (bigPermsFile) {
	bigPerms = require(bigPermsFile);
}

const bigUserMap = {};
bigPerms.forEach(bp => {
	bigUserMap[bp.userId] = bp.id;
});

const userMap = {};

perms.permissions.forEach(p => {
	p.grantedTo.forEach(g => {
		if (!userMap[g]) userMap[g] = [];
		userMap[g].push(p.permissionName);
	});
});

for (uid in userMap) {
	let permUser = { userId: uid, permissions: userMap[uid] };
	if (bigUserMap[uid]) permUser.id = bigUserMap[uid];
	console.log(JSON.stringify(permUser));
}
