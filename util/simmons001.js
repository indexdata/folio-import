/*
  This script copies to 907a field to 001 and assigns to old 001 to 035 if it is not an OCoLC number.
  It also assigns CaEvIII to the 003.  This is III Millennium's organization symbol.
  This script is supposed to be used in conjunction with updateParsedRecords.js
*/

module.exports = (pr) => {
  let bnum;
  let oldNum;
  let oldOrg;

  // get data
  for (let field of pr.fields) {
    let tag = Object.keys(field)[0];
    if (tag === '001') {
      oldNum = field[tag];
    } else if (tag === '003') {
      oldOrg = field[tag];
    } else if (tag === '907') {
      for (let sub of field[tag].subfields) {
        let code = Object.keys(sub)[0];
        if (code === 'a') {
          bnum = sub[code].replace(/^\.(b.......).*/, '$1');
        }
      }
    }
  }

  if (bnum) {
    let found = {};
    for (let field of pr.fields) {
      let tag = Object.keys(field)[0];
      if (tag === '001') {
        field[tag] = bnum;
        found[tag] = true;
      } else if (tag === '003') {
        field[tag] = 'CaEvIII';
        found[tag] = true;
      } else if (tag === '035') {
        let data;
        if (oldOrg) {
          data = { a: `(${oldOrg})${oldNum}`};
        } else {
          data = { a: `(MBSi)${oldNum}`}
        }
        if (oldOrg !== 'OCoLC') field[tag].subfields.push(data);
        found[tag] = true;
      }
    }
    for (let tag of ['001','003','035']) {
      if (!found[tag]) {
        if (tag === '001') {
          pr.fields.push({ '001': bnum});
        } else if (tag === '003') {
          pr.fields.push({ '003': 'CaEvIII' });
        } else {
          let data;
          if (oldOrg) {
            data = `(${oldOrg})${oldNum}`;
          } else {
            data = `(MBSi)${oldNum}`;
          }
          pr.fields.push({ '035': { ind1: " ", ind2: " ", subfields: [ { a: data } ] } });
        }
      }
    }
    return pr;
  } else {
    return null;
  }
};