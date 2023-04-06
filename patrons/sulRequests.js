const fs = require('fs');
const path = require('path');
const parse = require('csv-parse/lib/sync');
const uuid = require('uuid/v5');
const superagent = require('superagent');
const { request } = require('http');

const spFile = process.argv[2];
const usersFile = process.argv[3];
const csvFile = process.argv[4];
const reqLevel = process.argv[5] || 'Item';
const ns = '34d6cfa4-f604-47ec-83d2-3c2aec16a986';
const tenant = 'sul';

(async () => {
  try {
    if (!csvFile) {
      throw new Error('Usage: node sulRequests.js <service_points_file> <users_file> <loans_csv_file> [ <type [Item|Title]>');
    }
    if (!fs.existsSync(csvFile)) {
      throw new Error('Can\'t find loans file');
    }
    if (!fs.existsSync(spFile)) {
      throw new Error('Can\'t find service points file');
    }
    if (!fs.existsSync(usersFile)) {
      throw new Error('Can\'t find users file');
    }
    if (reqLevel && !reqLevel.match(/Item|Title/)) {
      throw new Error(`${reqLevel} is not a proper requestLevel!`);
    }

    let begin = new Date().valueOf();

    const config = JSON.parse(fs.readFileSync('../.okapi', { encoding: 'utf8' }));
    if (config.tenant !== tenant) throw new Error('There is a tenant mismatch. Run the authToken.js script with proper config!');

    const sp = require(spFile);
    spMap = {};
    console.log(`Mapping service points from ${spFile}`);
    sp.servicepoints.forEach(s => {
      spMap[s.code] = s.id;
    });

    let csv = fs.readFileSync(csvFile, { encoding: 'utf8'});
    csv = csv.replace(/^\uFEFF/, ''); // remove BOM

    const inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true
    });

    console.log(`Loading users from ${usersFile}`);
    const users = require(usersFile);
    delete require.cache[require.resolve(usersFile)];

    let requesters = {};
    users.users.forEach(u => {
      requesters[u.barcode] = { active: u.active, expirationDate: u.expirationDate, id: u.id };
    });

    let dateOffset = (dt) => {
      let dzo = new Date(dt).getTimezoneOffset();
      let pto = ((dzo+120)/60);  // change this value according to the local machine that runs the script.
      const out = `-0${pto}:00`;
      return out; 
    }

    const parseDate = (dt) => {
      const out = dt.replace(/^(\d{4})(\d\d)(\d\d)/, '$1-$2-$3T12:00:00');
      return out;
    }

    const files = {
      co: 'requests.jsonl',
      ia: 'inactive_requests.jsonl',
      nf: 'no_user_requests.jsonl'
    };

    let workDir = path.dirname(csvFile);
    for (let f in files) {
      let lvl = reqLevel.toLowerCase();
      let fullPath = workDir + '/' + lvl + '-' + files[f];
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      files[f] = fullPath;
    }

    const writeTo = (file, obj) => {
      fs.writeFileSync(file, JSON.stringify(obj) + '\n', { flag: 'a'});
    };

    let total = 0;
    let succ = 0;
    const ibcodeSeen = {};

    for (let x = 0; x < inRecs.length; x++) {
      let r = inRecs[x];
      total++;
      let ubcode = r['User barcode'];
      let ibcode = r['Item barcode'];
      let rdate = r['Request date'];
      let exdate = r['Request expiration date'];
      let sp = r['Pickup servicepoint'];
      let rflag = r['Recalled flag'];
      let adate = r['Date available'];
      let proxyBc = r['Proxy barcode'];
      let comment = r['Patron comments'];
      let ukey = ubcode + ibcode;
      let userId;
      if (requesters[ubcode]) {
        userId = requesters[ubcode].id;
      } else {
        console.log(`[${total}] WARN User not found with barcode ${ubcode}`);
      }
      let spId = spMap[sp];
      let item;

      if (userId) {
        if (reqLevel === 'Item' && ibcode) {
          if (!ibcodeSeen[ibcode]) {
            let url = `${config.url}/item-storage/items?query=barcode==${ibcode}`;
            console.log(`[${total}] GET ${url}`);
            try {
              let res = await superagent
                .get(url)
                .set('x-okapi-token', config.token);
              item = res.body.items[0];
              if (item) {
                try {
                  let res = await superagent
                    .get(`${config.url}/holdings-storage/holdings/${item.holdingsRecordId}`)
                    .set('x-okapi-token', config.token);
                  item.instanceId = res.body.instanceId;
                } catch (e) {
                  let msg = (e.response) ? e.response.text : e;
                  console.log(msg); 
                }
              }
            } catch (e) {
              let msg = (e.response) ? e.response.text : e;
              console.log(msg);
            }
          } else {
            console.log(`[${total}] Item with barcode ${ibcode} found in cache...`);
            item = ibcodeSeen[ibcode];
          }
        }
        
        if (item) {
          rdate = parseDate(rdate);
          rdate += dateOffset(rdate);
          exdate = parseDate(exdate)
          exdate += dateOffset(exdate);
          let requestType = "Page";
          if (item.status.name === "Checked out") {
            if (rflag) {
              requestType = "Recall";
            } else {
              requestType = "Hold";
            }
          }
          let req = {
            id: uuid(ukey, ns),
            requesterId: userId,
            itemId: item.id,
            holdingsRecordId: item.holdingsRecordId,
            instanceId: item.instanceId,
            requestDate: rdate,
            fulfilmentPreference: "Hold Shelf",
            pickupServicePointId: spId,
            requestType: requestType,
            requestLevel: reqLevel,
            requestExpirationDate: exdate,

          };
          if (proxyBc && requesters[proxyBc]) {
            req.proxyUserId = requesters[proxyBc].id;
          }
          if (comment) {
            req.patronComments = comment;
          }
          ibcodeSeen[ibcode] = item;
          writeTo(files.co, req);
          succ++;
        } else {
          console.log(`WARN no item found with barcode ${ibcode}`);
        }
      }
    }

    let end = new Date().valueOf();
    let tt = (end - begin)/1000;
    console.log('Time (secs)', tt);
    console.log('Processed', total);
    console.log('Created:', succ);
  } catch (e) {
    const msg = (e.message) ? e.message : e;
    console.error(e.message);
    console.log(e);
  }
})();
