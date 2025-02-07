export function capt2stat(caption, chron) {
    // console.log(caption);
    // console.log(chron);
    const ecodes = ['a','b','c','d','e','f','g','h'];
    let csubs = {};
    let esubs = {};
    caption.subfields.forEach(s => {
        let k = (Object.keys(s)) ? Object.keys(s)[0] : '';
        csubs[k] = s[k];
    });
    chron.subfields.forEach(s => {
        let k = (Object.keys(s)) ? Object.keys(s)[0] : '';
        esubs[k] = s[k];
    });
    // console.log(csubs);
    // console.log(esubs);
    let link = csubs['8'];
    delete csubs['8'];
    let levels = [];
    let st = '';
    for (let k in csubs) {
        if (k <= 'h') {
            let cv = csubs[k] || '';
            let ev = esubs[k] || '';
            let eparts = ev.split(/\-/);
            let o = [];
            eparts.forEach(p => {
                o.push(cv + p);
            });
            levels.push(o);
        } 
    }
    let topLevel = levels.shift();
    let sparts = [];
    topLevel.forEach((v, i) => {
        levels.forEach(nl => {
            sparts.push(v + ':' + nl[i]);
        });
    });
    let out = sparts.join('-');
    console.log(out);
}