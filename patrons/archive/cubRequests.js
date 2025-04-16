const fs = require('fs');
const path = require('path');
const uuid = require('uuid/v5');
const superagent = require('superagent');
const readline = require('readline');

// const spFile = process.argv[2];
const usersFile = process.argv[2];
const holdsFile = process.argv[3];
const reqLevel = process.argv[4];
const ns = 'f2f286a0-def5-4ec2-8622-2c97da38e207';
const tenant = 'cu';

const spMap = {
  busp1: 'c7819597-0f87-464f-9c92-adcf3c502af3',
  busst: 'c7819597-0f87-464f-9c92-adcf3c502af3',
  eng: '5b9ffdc7-5f1b-4079-acd7-e27464136449',
  engst: '5b9ffdc7-5f1b-4079-acd7-e27464136449',
  esc: '5124a48f-2f84-4783-ad0d-98c28eaee057',
  escst: '5124a48f-2f84-4783-ad0d-98c28eaee057',
  musst: '5bff2625-efa8-445b-9612-57fdcb4df4d3',
  nor: '3a40852d-49fd-4df2-a1f9-6e2641a6e91f',
  norln: '3a40852d-49fd-4df2-a1f9-6e2641a6e91f',
  norst: '3a40852d-49fd-4df2-a1f9-6e2641a6e91f',
  nstar: '034b5515-c672-45ef-84eb-f2549d945041',
  testg: '948b006e-f86c-4d5b-9888-ee56ddbcc8b7'
};

const statMap = {
  '0': 'Open - Not yet filled',
  'i': 'Open - Awaiting pickup',
  't': 'Open - In transit'
};

(async () => {
  try {
    if (!holdsFile) {
      throw('Usage: node cubRequests.js <users_map> <holds_jsonl> <level [Item|Title]>');
    }
    if (!fs.existsSync(holdsFile)) {
      throw new Error('Can\'t find loans file');
    }
    /*
    if (!fs.existsSync(spFile)) {
      throw new Error('Can\'t find service points file');
    }
    */
    if (!fs.existsSync(usersFile)) {
      throw('Can\'t find users file');
    }
    if (!reqLevel) {
      throw(`A level of "Item" or "Title" must be entered!`);
    }
    if (reqLevel && !reqLevel.match(/Item|Title/)) {
      throw(`${reqLevel} is not a proper requestLevel!`);
    }

    let begin = new Date().valueOf();

    const config = JSON.parse(fs.readFileSync('../.okapi', { encoding: 'utf8' }));
    if (config.tenant !== tenant) throw new Error('There is a tenant mismatch. Run the authToken.js script with proper config!');

    /*
    const sp = require(spFile);
    spMap = {};
    console.log(`Mapping service points from ${spFile}`);
    sp.servicepoints.forEach(s => {
      spMap[s.code] = s.id;
    });
    console.log(spMap); return;
    */

    let fileStream = fs.createReadStream(usersFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    const requesters = {};
    for await (let line of rl) {
      let [k, v] = line.split(/\|/);
      requesters[k] = v;
    };

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

    let workDir = path.dirname(holdsFile);
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
    let iacount = 0;
    const ibcodeSeen = {};

    fileStream = fs.createReadStream(holdsFile);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (let line of rl) {
      let r = JSON.parse(line);
      // console.log(r);
      total++;
      let uid = (r.patron) ? r.patron.replace(/^.+\//, '') : '';
      let iid = (r.record) ? r.record.replace(/^.+\//, 'i') : '';
      iid = iid.replace(/@.+/, '');
      let rdate = r.placed;
      let exdate = r.notNeededAfterDate;
      let sp = (r.pickupLocation) ? r.pickupLocation.code.trim() : '';
      let stat = (r.status) ? r.status.code : '';
      let reqStat = statMap[stat];
      let rflag = r['Recalled flag'] || '';
      let adate = r['Date available'] || '';
      let proxyBc = r['Proxy barcode'] || '';
      let comment = r['Patron comments'] || '';
      let ukey = uid + iid; 
      let userId;
      if (requesters[uid]) {
        userId = requesters[uid];
      } else {
        console.log(`[${total}] WARN User not found with patron ID ${uid}`);
      }
      let spId = spMap[sp];
      let item;
      let inst;

      if (userId) {
        if (reqLevel === 'Item' && iid) {
          if (!ibcodeSeen[iid]) {
            let url = `${config.url}/item-storage/items?query=hrid==${iid}`;
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
            console.log(`[${total}] Item with HRID ${iid} found in cache...`);
            item = ibcodeSeen[iid];
          }
        } else if (reqLevel === 'Title' && instHrid) {
          let url = `${config.url}/instance-storage/instances?query=hrid==${instHrid}`;
          try {
            let res = await superagent
              .get(url)
              .set('x-okapi-token', config.token);
            inst = res.body.instances[0];
          } catch (e) {
            let msg = (e.response) ? e.response.text : e;
            console.log(msg);
          }
        }
        
        if (item || inst) {
          // rdate = parseDate(rdate);
          // rdate += dateOffset(rdate);
          // exdate = parseDate(exdate)
          // exdate += dateOffset(exdate);
          let requestType = (reqLevel === 'Title') ? 'Hold' : 'Page';
          if (item && item.status.name.match(/^(Checked out|Restricted|Awaiting pickup|In process|Aged to lost|On order|Missing|In transit)$/)) {
            if (rflag) {
              requestType = 'Recall';
            } else {
              requestType = 'Hold';
            }
          }
          if (reqLevel === 'Title') requestType = 'Hold'
          let req = {
            id: uuid(ukey, ns),
            requesterId: userId,
            requestDate: rdate,
            fulfilmentPreference: "Hold Shelf",
            pickupServicePointId: spId,
            requestType: requestType,
            requestLevel: reqLevel,
            requestExpirationDate: exdate,
            status: reqStat
          };
          if (item) {
            req.itemId = item.id;
            req.holdingsRecordId = item.holdingsRecordId;
            req.instanceId = item.instanceId;
          } else if (inst) {
            req.instanceId = inst.id;
          }
          if (proxyBc && requesters[proxyBc]) {
            req.proxyUserId = requesters[proxyBc].id;
          }
          if (comment) {
            req.patronComments = comment;
          }
          ibcodeSeen[iid] = item;
          writeTo(files.co, req);
          succ++;
        } else {
          if (reqLevel === 'Item') {
            console.log(`WARN no item found with HRID ${iid}`);
          } else {
            console.log(`WARN no instance found with HRID ${instHrid}`);
          }
        }
      }
    }

    let end = new Date().valueOf();
    let tt = (end - begin)/1000;
    console.log('Time (secs)', tt);
    console.log('Processed', total);
    console.log('Created:', succ);
    console.log('Inactives:', iacount);
  } catch (e) {
    const msg = (e.message) ? e.message : e;
    console.log(e);
  }
})();
