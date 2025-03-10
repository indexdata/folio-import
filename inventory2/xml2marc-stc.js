/*
    This script will take authority records from STC's authority XML file and output raw MARC21 records.
*/

import { txt2raw } from '../js-marc/js-marc.mjs';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { XMLParser } from 'fast-xml-parser';

const inFile = process.argv[2];
const dbug = process.env.DEBUG;

(async () => {
    try {
        if (!fs.existsSync(inFile)) throw('Usage: node xml2marc-stc.js <xml_file>');

        let dir = path.dirname(inFile);
        let outPath = `${dir}/auth.mrc`;
        if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

        const options = {
            ignoreAttributes: false,
            attributeNamePrefix: "_",
            trimValues: false
        };
        const parser = new XMLParser(options);
        
        let fileStream = fs.createReadStream(inFile);
        let rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let lc = 0;
        let rc = 0;
        let data = '';
        let nonUtf = false;
        for await (let l of rl) {
            lc++;
            if (l.match(/^<entries>/)) {
                data = l;
            } else if (l.match(/^<\/entries>/)) {
                data += l;
                let o = parser.parse(data);
                let entries = o.entries || {};
                let fields = entries.marcEntry || [];
                let txt = '';
                fields.forEach(f => {
                    let tag = f._tag;
                    let ind = f._ind;
                    let d = f['#text'];
                    if (tag === '000') {
                        d = '00000nz  a2200000n  4500'; 
                        txt += d + '\n';
                    } else if (tag > '009') {
                        d = d.replace(/\|(\w)/g, ' $$$1 ');
                        txt += tag + ' ' + ind + d + '\n';
                    } else {
                        d = d.replace(/^\|./, '');
                        txt += tag + ' ' + d + '\n';
                    }
                });
                let raw = txt2raw(txt);
                fs.writeFileSync(outPath, raw, { flag: 'a' });
                rc++
                if (rc % 10000 === 0) console.log('MARC records created:', rc);
            } else {
                data += l
            }
        }
        console.log('Done!');
        console.log('Total Records created:', rc);
    } catch (e) {
        console.log(e)
    }
})()