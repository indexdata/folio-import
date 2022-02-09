/*
  This script will attempt to update the system generated permissions versions based on a tenants modules.
  Get modules at /_/proxy/tenants/${TENANT}/modules.
*/
const path = require('path');
const fs = require('fs');

const inMod = process.argv[2];
const inPerm = process.argv[3];

try {
  if (!inPerm) throw(`Usage: node permsVersions.js <modules_json_file> <permissions_json_file>`);
  let dir = path.dirname(inPerm);
  let outFile = dir + '/' + 'perms-fixed.json';
  const mods = require(inMod);
  const modMap = {};
  mods.forEach(m => {
    let k = m.id.replace(/^(.+)-.*/, '$1');
    let v = m.id.replace(/^.+-/, '');
    modMap[k] = v;
  });

  const perms = require(inPerm);
  perms.permissions.forEach(p => {
    let subsReplace = [];
    p.subPermissions.forEach(s => {
      if (s.match(/^SYS#/)) {
        let mod = s.replace(/^.+?#(.+?)#.*/, '$1');
        let k = mod.replace(/^(.+)-.*/, '$1'); 
        let v = mod.replace(/^.+-/, '');
        let replaceStr = mod;
        if (modMap[k]) {
          replaceStr = k + '-' + modMap[k];
        }
        s = s.replace(/#.+?#/, `#${replaceStr}#`);
      }
      subsReplace.push(s);
    });
    p.subPermissions = subsReplace;
  });
  fs.writeFileSync(outFile, JSON.stringify(perms, null, 2));
  console.log('Writing to', outFile);
  
} catch (e) {
  console.log(`${e}`);
}
