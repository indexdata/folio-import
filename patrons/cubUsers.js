const readline = require('readline');
const fs = require('fs');
const uuid = require('uuid/v5');

const ns = '70c937ca-c54a-49cd-8c89-6edcf336e9ff';
const patronFile = process.argv[2];

try {

  if (!patronFile) throw 'Usage: node cubUsers.js <sierra_patron_file>';
  if (!fs.existsSync(patronFile)) throw `Can't find patron file "${patronFile}"!`;

  const fileStream = fs.createReadStream(patronFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  rl.on('line', l => {
    let patRec = JSON.parse(l);
    let pid = patRec.id.toString();
    let fixedFields = {};
    for (let code in patRec.fixedFields) {
      let ff = patRec.fixedFields[code];
      fixedFields[ff.label] = ff.value;
    }
    let varFields = {};
    for (let x = 0; x < patRec.varFields.length; x++) {
      let vf = patRec.varFields[x];
      let tag = vf.fieldTag;
      if (!varFields[tag]) {
        varFields[tag] = [];
      }
      varFields[tag].push(vf.content);
    }
    let name = [];
    if (varFields.n) {
      name = varFields.n[0].split(/, | /);
    }

    user = {
      id: uuid(pid, ns),
      externalSystemId: pid,
      barcode: (varFields.b) ? varFields.b[0] : '',
      username: (varFields.r) ? varFields.r[0] : '',
      personal: {
        lastName: name[0],
        firstName: name[1],
        middleName: name.slice(2).join(' ') || '',
        email: (varFields.z) ? varFields.z[0] : '',
        phone: (varFields.p) ? varFields.p[0] : '',
        mobilePhone: (varFields.t) ? varFields.t[0] : '',
        address: [],
      }
    }
    // console.log(varFields);
    console.log(user);
  });
} catch (e) {
  console.log(e);
}