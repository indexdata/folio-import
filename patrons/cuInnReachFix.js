const fs = require('fs');
const readline = require('readline');
const path = require('path');

let ufile = process.argv[2];

const gmap = {
    "ca26c143-ea77-56ad-b38a-de7f28d39e65": "0", //CU Boulder Department",
    "deef647e-809a-5637-b917-a21e86eab27c": "0", //CU Boulder Visiting scholars",
    "bc57be5b-d78a-5843-b16e-f6f5d3215b15": "0", //CU Boulder faculty/staff",
    "031cce90-1b0a-596c-942f-f044f0092b0d": "0", //CU Boulder graduate",
    "2c477e6b-79f2-5f0e-863a-0280d9ab8b5b": "0", //CU Boulder undergraduate",
    "d1dc0e68-9ccc-5730-8523-eaa4cab4b0e3": "0", //Continuing Ed students, degree and non-degree seeking",
    "61f01860-7403-5136-997d-37a1772401ce": "0", //Friends of the Libraries",
    "c4a4cae4-d4a8-5e63-ba36-6b579e4ad5b6": "0", //Library Department",
    "e98e4991-702c-5489-882a-c78f0bf1f229": "0", //CU Boulder POI",
    "7db317e2-6091-5279-b744-ba1bb91dc1c0": "1", //Law faculty/staff",
    "5f02e6af-0e6a-527b-9843-9d6f8b61a754": "1", //Law students",
};

(async () => {
    if (!ufile) throw new Error('Usage: cuInnReachFix.js <users_jsonl_file>');

    let dir = path.dirname(ufile);
    let base = path.basename(ufile, '.jsonl');
    let outFile = dir + '/' + base + 'Update.jsonl';
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

    let fileStream = fs.createReadStream(ufile);
    let rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    ttl = {
        c: 0,
        u: 0,
        v: 0,
        l: 0,
        d: 0,
        i: 0,
        n: 0
    }
    for await (let line of rl) {
        ttl.c++;
        let r = JSON.parse(line);
        if (r.active) {
            let o = gmap[r.patronGroup];
            if (o) {
                if (!r.customFields) r.customFields = {};
                if (!r.customFields.innreachAgency) {
                    if (o === '0') {
                        r.customFields.innreachAgency = 'opt_0';
                        ttl.v++;
                    } else {
                        r.customFields.innreachAgency = 'opt_1';
                        ttl.l++;
                    }
                    let rstr = JSON.stringify(r);
                    fs.writeFileSync(outFile, rstr + '\n', { flag: 'a' });
                    ttl.u++;
                } else {
                    ttl.d++
                }
            } else {
                ttl.n++;
            }
        } else {
            ttl.i++;
        }
    }

    console.log('Done');
    console.log('Records read:', ttl.c);
    console.log('Skipped (inactive):', ttl.i);
    console.log('Skipped (not in groupMap):', ttl.n);
    console.log('Skipped (done):', ttl.d);
    console.log('Records updated:', ttl.u);
    console.log('  Univeristy Libraries:', ttl.v);
    console.log('  CU Law:', ttl.l);
})();
