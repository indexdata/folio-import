import { capt2stat } from '../lib-tools.mjs';

let ecapStr;
let enumStr;

ecapStr = '03$81$av.$b[no.]';
enumStr = '40$81.1$a1-7$b1-12';
// [Display example: v.1:[no.]1-v.7:[no.]12]

ecapStr = '00$81$av.$bsuppl.$i(year)$j(month)$k(day)';
enumStr = '41$81.1$a16$b1$i1977$j06$k01'
// [Display example: v.16:suppl.1 (1977: June 1)]


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
