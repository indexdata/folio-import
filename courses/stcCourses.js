const readline = require('readline');
const fs = require('fs');
const path = require('path');
let uuid;
try {
  uuid = require('uuid/v5');
} catch (e) {
  const { v5 } = require('uuid');
  uuid = v5;
}
const { parse } = require('csv-parse/sync');

const ns = '3c6165c4-6377-48f6-a60c-92ab31bb3649';
let refDir = process.argv[2];
let instFile = process.argv[3];
let inFile = process.argv[4];
let resFile = process.argv[5];

const writeOut = (fileName, data) => {
  let jstr = JSON.stringify(data, null, 2);
  fs.writeFileSync(fileName, jstr);
}

(async () => {
  try {
    if (!inFile) throw 'Usage: node stcCourses.js <ref_dir> <instructors_csv_file> <courses_csv_file> [ <reserves_csv_file ]';
    if (!fs.existsSync(inFile)) throw `Can't find user file: ${inFile}!`;
    if (!fs.existsSync(refDir)) throw `Can't find ref data directory: ${refDir}!`;

    const today = new Date().valueOf();
    refDir = refDir.replace(/\/$/, '');
    let wdir = path.dirname(inFile);
    let base = path.basename(inFile, '.txt', '.csv');
    let usersFile = wdir + '/users.jsonl';
    if (!fs.existsSync(usersFile)) throw `Can't find required users file at ${usersFile}!`;
    let itemFile = wdir + '/items.jsonl';
    if (resFile && !fs.existsSync(itemFile)) throw `Can't find required items file at ${itemFile}!`;

    let outFile = wdir + '/' + 'loadCourses.json'

    const refData = {};
    let rfiles = fs.readdirSync(refDir);
    rfiles.forEach(f => {
      let path = refDir + '/' + f;
      let j = require(path);
      let prop;
      for (k in j) {
        if (k !== 'totalRecords') prop = k;
      }
      refData[prop] = {};
      j[prop].forEach(o => {
        let k = o.name;
        let v = o.id;
        refData[prop][k] = v;
        if (o.code) refData[prop][o.code] = v;
      });
    });
    // throw(refData);

    const users = {};
    let fileStream = fs.createReadStream(usersFile);
    let rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    for await (let l of rl) {
      let r = JSON.parse(l);
      let k = r.username;
      users[k] = { 
        id: r.id,
        n: r.personal.firstName + ' ' + r.personal.lastName,
        bc: r.barcode,
        pg: r.patronGroup
      };
    }
    // throw(users);

    const inst = {};
    let csv = fs.readFileSync(instFile, {encoding: 'utf8'});
    let inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      delimiter: '|',
      relax_column_count: true
    });
    for (let x = 0; x < inRecs.length; x++) {
      let r = inRecs[x];
      let code = r.COURSE_CODE;
      let un = r.RSV_INSTRUCTOR;
      if (!inst[code]) inst[code] = [];
      let u = users[un];
      let id = uuid(un + code, ns);
      let o = {
        id: id,
        userId: u.id,
        name: u.n,
        barcode: u.bc,
        patronGroup: u.pg
      }
      inst[code].push(o);
    }
    // throw(inst);

    const res = {};
    let items = {};
    if (resFile) {
      console.log('Mapping items (this could take awhile)...');
      let fileStream = fs.createReadStream(itemFile);
      let rl = readline.createInterface({
          input: fileStream,
          crlfDelay: Infinity
      });
      for await (let l of rl) { 
        let r = JSON.parse(l);
        items[r.hrid] = r.id;
      }

      let csv = fs.readFileSync(resFile, {encoding: 'utf8'});
      let inRecs = parse(csv, {
        columns: true,
        skip_empty_lines: true,
        delimiter: '|',
        relax_column_count: true
      });
      for (let x = 0; x < inRecs.length; x++) {
        let r = inRecs[x];
        let k = r.COURSE_CODE;
        if (!res[k]) res[k] = []
        let hrid = 'ui' + r.ITEM_ID;
        let iid = items[hrid];
        res[k].push(iid);
      }
    }
    items = {};
    // throw(res);

    csv = fs.readFileSync(inFile, {encoding: 'utf8'});
    inRecs = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      delimiter: '|',
      relax_column_count: true
    });
    
    let lcount = 0;
    let ccount = 0;
    let icount = 0;
    let rcount = 0;
    let count = 0;
    let out = {
      courselistings: [],
      courses: [],
      instructors: [],
      reserves: []
    }
    for (let x = 0; x < inRecs.length; x++) {
      count++;
      let r = inRecs[x];

      let loc = r.LOCATION;
      let trm = r.TERM;
      let code = r.COURSE_CODE;
      let name = r.COURSE_NAME;
      let sec = r.SECTION;
      let dep = r.DEPT_CODE;
      let typ = r.COURSE_TYPE;

      let trmId = refData.terms[trm];
      let locId = refData.locations[loc];
      let typId = refData.courseTypes[typ];
      let l = {
        id: uuid(code + 'listing', ns),
        termId: trmId,
        locationId: locId,
        courseTypeId: typId,
        instructorObjects: []
      }
      let i = inst[code];
      if (i) {
        i.forEach(o => {
          o.courseListingId = l.id;
          out.instructors.push(o);
          icount++;
        });
      }
      if (l.termId) {
        out.courselistings.push(l);
        lcount++;
      } else {
        console.log(`ERROR creating course listing: termId not found for ${trm}`);
      }

      let depId = refData.departments[dep];
      let c = {
        id: uuid(code + 'course', ns),
        courseNumber: code,
        name: name,
        sectionName: sec,
        courseListingId: l.id,
        departmentId: depId
      }
      if (c.name) {
        if (c.courseListingId) {
          if (c.departmentId) {
            out.courses.push(c);
            ccount++;
          }
        }
      }

      let itemIds = res[code];
      if (itemIds) {
        itemIds.forEach(id => {
          let rr = {
            id: uuid(id + l.id, ns),
            itemId: id,
            courseListingId: l.id
          };
          out.reserves.push(rr);
          rcount++;
        });
      }
    }

    writeOut(outFile, out);

    const t = (new Date().valueOf() - today) / 1000;
    console.log('------------');
    console.log('Finished!');
    console.log('Processed:', count);
    console.log('Listings:', lcount);
    console.log('Courses:', ccount);
    console.log('Instructors:', icount);
    console.log('Reserves', rcount);
    console.log('Saved to:', outFile);
    console.log('Time (secs):', t);
  } catch (e) {
    console.log(e);
  }
})()