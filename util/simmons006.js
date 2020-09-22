/*
  This script copies to 907a field to 001 and assigns to old 001 to 035 if it is not an OCoLC number.
  It also assigns CaEvIII to the 003.  This is III Millennium's organization symbol.
  This script is supposed to be used in conjunction with updateParsedRecords.js
*/

module.exports = (pr) => {
  // get data
  let x = 0;
  for (let field of pr.fields) {
    let tag = Object.keys(field)[0];
    if (tag === '006' || tag === '007') {
      pr.fields.splice(x, 1);
    }
    x++;
  }

  return pr;
};