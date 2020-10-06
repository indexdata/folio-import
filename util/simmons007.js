/*
  This script copies to 907a field to 001 and assigns to old 001 to 035 if it is not an OCoLC number.
  It also assigns CaEvIII to the 003.  This is III Millennium's organization symbol.
  This script is supposed to be used in conjunction with updateParsedRecords.js
*/

module.exports = (pr) => {
  let changed = false;
  for (let x = 0; x < pr.fields.length; x++) {
    let field = pr.fields[x];
    let tag = Object.keys(field)[0];
    if ((tag === '006' && field[tag].match(/^m/)) || (tag === '007' && field[tag].match(/^c/))) {
      pr.fields.splice(x, 1);
      changed = true;
      x--;
    }
  }
  if (changed) {
    return pr;
  } else {
    return null;
  }
};