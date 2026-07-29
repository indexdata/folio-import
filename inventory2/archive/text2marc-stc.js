/*
    This script will take authority records from STC's Dump.txt file and output raw MARC21 records.
*/

import { txt2raw } from '../js-marc/js-marc.mjs';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const inFile = process.argv[2];
const dbug = process.env.DEBUG;

(async () => {
    try {
        if (!fs.existsSync(inFile)) throw('Usage: node text2marc-stc.js <text_file>');

        let dir = path.dirname(inFile);
        let outPath = `${dir}/auth.mrc`;
        if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
        
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
            if (l.match(/^\*\*\* DOC/) && lc > 1) {
                
                let raw = txt2raw(data);
                fs.writeFileSync(outPath, raw, { flag: 'a' })
                data = '';
                rc++;
                if (rc % 10000 === 0) {
                    console.log('Records created:', rc)
                }
            } else {
                if (l.match(/^\.\d\d\d\. /)) {
                    l = l.replace(/^\.(\d{3})\./, '$1');
                    if (l.match(/^00/)) {
                        l = l.replace(/^000 .+/, `00000nz  a2200000n  4500`);
                        l = l.replace(/^(00[1-9]) \|./, '$1 ');
                    } else {
                        l = l.replace(/(^...) \|/, '$1   |');
                        l = l.replace(/\|(.)/g, ' $$$1 ');
                    }
                    if (l.match(/\x1b/) && !nonUtf) {
                        data = data.replace(/^00000nz  a/, '00000nz   ');
                        nonUtf = true;
                    }
                    data += l + '\n';
                }
            }
        }
        if (data) {
            let raw = txt2raw(data);
            fs.writeFileSync(outPath, raw, { flag: 'a' })
            rc++;
        }
        console.log('Done!');
        console.log('Total Records created:', rc);
    } catch (e) {
        console.log(e)
    }
})()