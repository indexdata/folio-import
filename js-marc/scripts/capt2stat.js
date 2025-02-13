import { capt2stat } from '../lib-tools.mjs';
let testNum = process.argv[2];
if (!testNum) throw new Error('Usage: node capt2stat.js <test_num>');

const test = [
  {
    ecapStr: '03$81$av.$b[no.]',
    enumStr: '40$81.1$a1-7$b1-12'
  },
  {
    ecapStr: '31$83$av.$bno.$u52$vr$i(year)$j(month)$k(day)$ww',
    enumStr:'  $83.1$a200$b18$i2006$j05$k04$wg'
  }
];
let ecapStr = test[testNum].ecapStr;
let enumStr = test[testNum].enumStr;


const parseStr = (str) => {
  const out = {};
  let sparts = str.split(/\$ */);
  let inds = sparts.shift();
  out.ind1 = inds.substring(0, 1);
  out.ind2 = inds.substring(1, 2);
  out.subfields = [];
  sparts.forEach(p => {
    let k = p.substring(0, 1);
    let v = p.substring(1);
    let o = {};
    o[k] = v;
    out.subfields.push(o);
  });
  return out;
}

try {
  let cap = parseStr(ecapStr);
  let ec = parseStr(enumStr);
  // console.log(cap, ec);
  let stat = capt2stat(cap, ec);
} catch (e) {
  console.log(e);
}
