const perms = require('./perms%2Fusers');

const out = { permissionUsers: [] };
perms.permissionUsers.forEach(p => {
  if (p.permissions[0]) {
	  p.permissions = [];
	  out.permissionUsers.push(p);
  }	  
});
console.log(JSON.stringify(out, null, 2));
