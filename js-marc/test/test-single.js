import { parseMarc } from '../js-marc.mjs';
import fs from 'fs';

let rawFile = process.argv[2];

let raw = fs.readFileSync(rawFile, { encoding: 'utf8' });

let mij = makeMij(raw);

console.log(JSON.stringify(mij, null, 2));