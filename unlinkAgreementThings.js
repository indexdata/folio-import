/*
  It is impossible to delete an agreement record if it has a linked agreements.
  This script will take a JSONL file of agreements, and delete the linked agreements,
  then PUT the changes to erm/sas.
*/

const fs = require('fs');
const superagent = require('superagent');
const readline = require('readline');
const { getAuthToken } = require('./lib/login');
const objFile = process.argv[2];


(async () => {
  try {
    if (!objFile) {
      throw new Error('Usage: node unlinkRelatedAgreements <agreements_file>');
    }

    let config  = await getAuthToken(superagent);

    let fileStream = fs.createReadStream(objFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let c = 0;
    for await (const line of rl) {
      let o = JSON.parse(line);
      let url = `${config.okapi}/erm/sas/${o.id}`
      console.log('GET', url);
      try {
        let res = await superagent
          .get(url)
          .set('User-Agent', config.agent)
          .set('cookie', config.cookie)
          .set('x-okapi-tenant', config.tenant)
          .set('x-okapi-token', config.token);
        let j = res.body;
        let runPut = false;
        if (j.outwardRelationships && j.outwardRelationships[0]) {
          for (let x = 0; x < j.outwardRelationships.length; x++ ) {
            j.outwardRelationships[x]._delete = true;
          }
          runPut = true;
        }
        if (j.linkedLicenses && j.linkedLicenses[0]) {
          for (let x = 0; x < j.linkedLicenses.length; x++ ) {
            j.linkedLicenses[x]._delete = true;
          }
          runPut = true;
        }
        if (runPut) {
          console.log('PUT', url);
          let pres = await superagent
            .put(url)
            .send(j)
            .set('User-Agent', config.agent)
            .set('cookie', config.cookie)
            .set('x-okapi-tenant', config.tenant)
            .set('x-okapi-token', config.token);
          if (pres.outwardRelationships) console.log('Outward relationships deleted:', pres.outwardRelationships.length);
          if (pres.linkedLicenses) console.log('Linked Licenses deleted:', pres.linkedLicenses.length);
        }
      } catch (e) {
        console.log(e.message);
      }
      c++
    }
    console.log('Lines read:', c);

  } catch (e) {
    console.log(e.message);
  }
})();
