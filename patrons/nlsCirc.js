const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const readline = require('readline');
let uuid;
try {
  uuid = require('uuid/v5');
} catch (e) {
  const { v5 } = require('uuid');
  uuid = v5;
}

let spFile = process.argv[2];
let usersFile = process.argv[3];
let itemFile = process.argv[4];
let circFile = process.argv[5];
let rroomFile = process.argv[6];
let reqFile = process.argv[7];
let dbug = process.env.DEBUG;

const ns = '25515560-9d65-4fcf-bf95-2cb27984f3e3';

const outFiles = {
  co: 'checkouts.jsonl',
  ia: 'inactive-users.jsonl',
  rq: 'requests.jsonl',
  rr: 'reading-room.jsonl'
};

const spTran = {
  RRLEX: 'SP-INFO',
  HEML: 'SP-INFO',
  PRUMS: 'SP-INFO',
  RRSPE: 'SP-SPE'
};

(async () => {
  try {
    if (!circFile) {
      throw('Usage: node nlsCirc.js <servicepoints_file> <users_jsonl_file> <items_jsonl_file> <z36_table> [ <z310_table> <z37_table> ]');
    }
    let circDir = path.dirname(circFile);
    const start = new Date().valueOf(); 
    const isoDate = new Date().toISOString().replace(/T.+/, '');

    if (!fs.existsSync(circFile)) throw(`Can't open z36 table at ${circFile}`);
    if (reqFile && !fs.existsSync(reqFile)) throw(`Can't open z37 table at ${reqFile}`);

    for (let k in outFiles) {
      outFiles[k] = circDir + '/' + outFiles[k];
      if (fs.existsSync(outFiles[k])) fs.unlinkSync(outFiles[k]);
    }
    // throw(outFiles);

    const spMap = {};
    let sp = require(spFile);
    sp.servicepoints.forEach(j => {
        spMap[j.code] = j.id;
        spMap[j.name] = j.id;
    });
    // throw(spMap);

    for (let k in spTran) {
      let c = spTran[k];
      spTran[k] = spMap[c];
    }
    // throw(spTran);


    // map users
    console.log(`Parsing users from ${usersFile}`);
    let fileStream = fs.createReadStream(usersFile);
    let rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    const users = {};
    let uc = 0;
    for await (let line of rl) {
      uc++;
      let o = JSON.parse(line);
      let k = (o.customFields) ? o.customFields.alephid : '';
      if (k) {
        users[k] = { id: o.id, active: o.active, bc: o.barcode, ex: o.expirationDate || '' };
      }
    }
    console.log(`Users parsed: ${uc}`);
    // throw(users.KB122126);

    // map items
    const items = {};
    const bcodeMap = {};
    console.log(`Parsing items from ${itemFile}`);
    fileStream = fs.createReadStream(itemFile);
    rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    let ic = 0;
    for await (let line of rl) {
      ic++;
      let o = JSON.parse(line);
      let k = o.hrid;
      items[k] = { bc: o.barcode, st: o.status.name, id: o.id };
      bcodeMap[o.barcode] = o.status.name;
      if (ic%250000 === 0) console.log(`Items parsed: ${ic}`);
    }
    console.log(`Items parsed: ${uc}`);
    // throw(bcodeMap);
    
    const parseDate = (dstr, type) => {
      let dt = '';
      dstr = dstr.replace(/^(....)(..)(..)/, '$1-$2-$3');
      if (dstr === '0000-00-00') dstr = isoDate;
      let dto = new Date(dstr)
      try {
        let dzo = dto.getTimezoneOffset()/60;
        // console.log('Timezone Offset:', dzo);
        let pto = (dzo > 0) ? `-0${dzo}:00` : (dzo < 0) ? `+0${dzo}:00` : 'Z'
        pto = pto.replace(/\+0-/, '+0');	    
        dt = dto.toISOString();
        dt = (type === 'due') ? dt.replace(/T.+/, `T23:59:59.000${pto}`) : dt.replace(/T.+/, `T12:00:00.000${pto}`);
      } catch (e) {
        console.log(`${e} : ${dstr}`);
        dt = 'ERR';
      }
      return(dt);
    }

    const writeOut = (file, obj) => {
      fs.writeFileSync(file, JSON.stringify(obj) + '\n', { flag: 'a'});
    };

    const ttl = {
      co: 0,
      ia: 0,
      unf: 0,
      inf: 0,
      ina: 0,
      ibc: 0,
      req: 0,
      rr: 0,
      err: 0,
      rerr: 0,
      rrerr: 0
    }

    const rrMap = {};

    if (rroomFile) {
      console.log(`Reading reading room lines from ${rroomFile}`);
      let csv = fs.readFileSync(rroomFile, {encoding: 'utf8'});
      const inRecs = parse(csv, {
        columns: true,
        skip_empty_lines: true,
        delimiter: '\t',
        relax_column_count: true,
        bom: true
      });

      console.log('Total rows in reading room file:', inRecs.length);

      inRecs.forEach(r => {
        let uid = r.Z310_ID;
        let user = users[uid];
        if (user) {
          let ibcode = r.Z310_BARCODE;
          rrMap[ibcode] = 1;
          let item = bcodeMap[ibcode];
          if (item) {
            let sp = r.Z310_RR_ID;
            let od = r.Z310_OUT_DATE;
            let ld = r.Z310_OPEN_DATE;
            let loanDate = parseDate(ld);
            let spId = spTran[sp];
            let o = {
              servicePointId: spId,
              itemBarcode: ibcode,
              userBarcode: user.bc,
              loanDate: loanDate,
              held: (od === '0') ? true : false
            };
            // all items will be on holdshelf
            o.held = true;
            // console.log(o);
            writeOut(outFiles.rr, o);
            ttl.rr++;
          } else {
            console.log(`ERROR Reading room item ${ibcode} not found!`);
            ttl.rrerr++;
          }
        } else {
          console.log(`ERROR Reading room user ${uid} not found!`)
          ttl.rrerr++;
        }
      });
    }

    console.log(`Reading circ lines from ${circFile}`);
    let csv = fs.readFileSync(circFile, {encoding: 'utf8'});
    const inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      delimiter: '\t',
      relax_column_count: true,
      bom: true
    });

    let cc = 0;
    console.log('Total rows in circ file:', inRecs.length);
    inRecs.forEach(r => {
      cc++;
      let loan = {};
      let lib = r.Z36_SUB_LIBRARY;
      let iid = r.Z36_REC_KEY;
      let item = items[iid];
      let uid = r.Z36_ID.trim();
      let user = users[uid];
      if (!user) {
        console.log(`ERROR no user found with alephId "${uid}" (${r.PATRON_NAME})`);
        ttl.unf++;
        ttl.err++;
      } else if (!item) {
        console.log(`ERROR no item found with hrid "${iid}"`);
        ttl.inf++;
        ttl.err++;
      } else if (item.st !== 'Available') {
        console.log(`ERROR item status for "${iid}" is "${item.st}"`);
        ttl.ina++;
        ttl.err++;
      } else {
        item.st = 'Checked out';
        loan.itemBarcode = item.bc;
        loan.userBarcode = user.bc;
        let ld = r.Z36_LOAN_DATE;
        let ldate = parseDate(ld, 'loan');
        if (ldate) loan.loanDate = ldate;
        let dd = r.Z36_DUE_DATE;
        let ddate = parseDate(dd, 'due');
        if (ddate) loan.dueDate = ddate;
        loan.servicePointId = spMap['SP-INFO'];
        if (r.RENEWAL_COUNT) loan.renewalCount = parseInt(r.RENEWAL_COUNT, 10);
        if (user.ex) loan.expirationDate = user.ex;
        if (loan.servicePointId) {
          if (dbug) loan.__ = r;
          if (!rrMap[item.bc]) {
            writeOut(outFiles.co, loan);
            ttl.co++;
          }
          if (!user.active) {
            writeOut(outFiles.ia, loan);
            ttl.ia++;
          }
        } else {
          console.log(`ERROR service point not found for "${lib}" (${item.bc} --> ${uid})`);
          ttl.err++;
        }
      }
    });

    if (reqFile) {
      console.log(`Reading request lines from ${reqFile}`);
      let csv = fs.readFileSync(reqFile, {encoding: 'utf8'});
      const inRecs = parse(csv, {
        columns: true,
        skip_empty_lines: true,
        delimiter: '\t',
        relax_column_count: true,
        bom: true
      });

      console.log('Total rows in request file:', inRecs.length);

      inRecs.forEach(r => {
        let key = r.Z37_REC_KEY.substring(0, 15);
        let p = parseInt(r.Z37_REC_KEY.substring(15), 10);
        let uid = r.Z37_ID.trim();
        let user = users[uid];
        let item = items[key];
        if (item) {
          if (user) {
            let id = uuid(r.Z37_REQUEST_NUMBER, ns);
            let hr = r.Z37_OPEN_HOUR.replace(/^(..)(..)/, 'T$1:$2:00');
            let rdate = r.Z37_OPEN_DATE;
            let rdateStr = parseDate(rdate);
            if (rdateStr === 'ERR') {
              console.log(JSON.stringify(r));
            }
            let nt = r.Z37_NOTE_1;
            let nt2 = r.Z37_NOTE_2;
            let t = (item.st === 'Available') ? 'Page' : 'Hold';
            let stat = (r.Z37_STATUS === 'S') ? 'Open - Awaiting pickup' : 'Open - Not yet filled';
            let edate = r.Z37_END_REQUEST_DATE;
            let hdate = r.Z37_END_HOLD_DATE;
            let pul = r.Z37_PICKUP_LOCATION.trim();
            let spId = spTran[pul];
            let fps = r.Z37_FILTER_PROCESS_STATUS;
            if (fps === 'DB') spId = spMap['SP-REPRO'];
            if (fps === 'LA') spId = spMap['SP-BE'];
            let o = {
              id: id,
              requesterId: user.id,
              itemId: item.id,
              requestType: t,
              requestDate: rdateStr,
              status: stat,
              position: p,
              fulfillmentPreference: 'Hold Shelf',
            }
            let pc = (nt & nt2) ? `${nt}; ${nt2}` : nt;
            if (pc) o.patronComments = pc;
            if (edate && edate > rdate) {
              let dval = parseDate(edate);
              if (dval !== 'ERR') {
                o.requestExpirationDate = dval;
              } else {
                console.log(JSON.stringify(r));
              }
            }
            if (hdate && hdate !== '0') {
              let dval = parseDate(hdate);
              if (dval !== 'ERR') {
                o.holdShelfExpirationDate = dval;
              } else {
                console.log(JSON.stringify(r));
              }
            }
            if (spId) o.pickupServicePointId = spId;
            if (spId) {
              if (dbug) o.__ = r;
              writeOut(outFiles.rq, o);
              ttl.req++;
              if (!user.active) {
                let o = {
                  userBarcode: user.bc,
                  expirationDate: user.ex
                }
                writeOut(outFiles.ia, o);
                ttl.ia++;
              }
            } else {
              console.log(`ERROR Request pickup service point for "${pul}:${fps}" not found!`);
              ttl.rerr++;
            }
          } else {
            console.log(`ERROR Request user not found with alephid "${uid}"!`);
            ttl.rerr++;
          }
        } else {
          console.log(`ERROR Request item not found with HRID "${key}"!`);
          ttl.rerr++;
        }
      });
    }

    

    const end = new Date().valueOf();
    const time = (end - start)/1000;
    console.log('Checkouts:', ttl.co);
    console.log('Inactives:', ttl.ia);
    console.log('Users not found:', ttl.unf);
    console.log('Items not found:', ttl.inf);
    console.log('Items not available:', ttl.ina);
    console.log('Items with no barcode:', ttl.ibc);
    console.log('Checkout errors:', ttl.err);
    console.log('Requests:', ttl.req);
    console.log('Request errors:', ttl.rerr);
    console.log('Reading room checkouts:', ttl.rr);
    console.log('Reading room errors:', ttl.rrerr);
    console.log('Time (sec):', time);
  } catch (e) {
    console.error(e);
  }
})();
