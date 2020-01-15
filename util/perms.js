const perms = require(process.argv[2]);

const out = { permissionUsers: [] };
perms.permissionUsers.forEach(p => {
  if (p.permissions[0]) {
	  p.permissions = [];
	  out.permissionUsers.push(p);
  }	  
});
console.log(JSON.stringify(out, null, 2));
