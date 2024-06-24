import { parseMarc } from '../js-marc.mjs';
import fs from 'fs';

let rawFile = process.argv[2];

let raw = fs.readFileSync(rawFile, { encoding: 'utf8' });

let out = parseMarc(raw);

console.log(JSON.stringify(out, null, 2));