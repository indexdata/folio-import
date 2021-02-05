/*
  Delete \x98 \x9c characters from German records.
  This script is supposed to be used in conjunction with updateParsedRecords.js
*/

module.exports = (pr) => {
  let prText = JSON.stringify(pr);
  if (prText.match(/\x98|\x9c/)) {
    prText = prText.replace(/\x98|\x9c/g, '');
    pr = JSON.parse(prText);
    return pr;
  } else {
    return pr;
  }
};
