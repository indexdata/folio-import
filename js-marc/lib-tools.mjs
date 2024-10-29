export function capt2stat(caption, chron) {
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
    let c8 = csubs['8'];
    delete csubs['8'];
    let lvl = {};
    let sparts = [];
    let st = '';
    for (let k in csubs) {
        let cv = csubs[k] || '';
        let ev = esubs[k] || '';
        let eparts = ev.split(/\-/);
        eparts.forEach(p => {
            if (!lvl[k]) lvl[k] = [];
            lvl[k].push(cv + p); 
        });
    }
    for (let k in lvl) {
        let vals = lvl[k];
        console.log(vals);
        for (let x = 0; x < vals.length; x++) {
            sparts.push(vals[x] + ':');
        }
    }
    console.log(lvl);
}