const cronMap = { 
    month: {
        '01': 'Jan.',
        '02': 'Feb.',
        '03': 'Mar.',
        '04': 'Apr.',
        '05': 'May',
        '06': 'June',
        '07': 'July',
        '08': 'Aug.',
        '09': 'Sep.',
        '10': 'Oct.',
        '11': 'Nov.',
        '12': 'Dec.'
    }
}

export function capt2stat(caption, chron) {
    // console.log(caption);
    // console.log(chron);
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
    let elevels = [];
    let clevels = [];
    let st = '';
    for (let k in csubs) {
        let c = csubs[k] || '';
        let v = esubs[k] || '';
        let parts = v.split(/\-/);
        if (k.match(/[a-h]/)) {
            let o = [];
            parts.forEach(p => {
                o.push(c + p);
            });
            elevels.push(o);
        } else if (k.match(/[i-m]/)) {
            let o = [];
            parts.forEach(p => {
                let mkey = c.replace(/\((.+?)\)/, '$1');
                let cmap = cronMap[mkey];
                let pv = (cmap && cmap[p]) ? cmap[p] : p;
                o.push(pv);
            });
            clevels.push(o);
        } 
    }
    // console.log(elevels);
    console.log(clevels);
    let topLevel = elevels.shift();
    let sparts = [];
    if (elevels[0]) {
        topLevel.forEach((v, i) => {
            elevels.forEach(nl => {
                sparts.push(v + ':' + nl[i]);
            });
        });
    } else {
        sparts = topLevel;
    }
    let out = sparts.join('-');
    console.log(out);
}