const months = { 
    '01': 'Jan.',
    '02': 'Feb.',
    '03': 'Mar.',
    '04': 'Apr.',
    '05': 'May',
    '06': 'Jun.',
    '07': 'Jul.',
    '08': 'Aug.',
    '09': 'Sep.',
    '10': 'Oct.',
    '11': 'Nov.',
    '12': 'Dec.',
    '21': 'Spring',
    '22': 'Summer',
    '23': 'Autumn',
    '24': 'Winter'
}

export function capt2stat(pattern, enumeration) {
    // console.log(caption);
    // console.log(chron);
    let splits = {};
    let codes = [];
    let open = 0;
    let fords = [];
    let pats = {};
    let enums = {};
    pattern.subfields.forEach(s => {
        let k = Object.keys(s);
        pats[k] = s[k];
    });
    enumeration.subfields.forEach(s => {
        let k = Object.keys(s);
        enums[k] = s[k];
    });

    for (let c in enums) {
        if (c === '8') {
            let ford = enums[c];
            fords.push(ford);
        }
        if (enums[c].match(/-$/)) {
            open = 1;
        }
        if (c.match(/[a-m]/)) {
            codes.push(c);
            splits[c] = enums[c].split(/-/);
        }
        let parts = []
        let preyear;
        let bin = [0, 1];
        bin.forEach(el => {
            let enumparts = [];
            let cronparts = [];
            for (let x = 0; x < codes.length; x++) {
                let c = codes[x];
                if (!splits[c][el]) {
                    continue;
                }
                let suf = pats[c];
                if (c.match(/[a-h]/) && !suf.match(/\((month|season|day|year)\)/)) {
                    enumparts.push(suf + splits[c][el]);
                } else {
                    let p = suf;
                    let v = splits[c][el] || splits[c][0];
                    if (p.match(/year/)) {
                        cronparts.push(v);
                        preyear = v;
                    } else if (p.match(/month|season/)) {
                        let m = months[v] || v;
                        cronparts.unshift(m);
                    } else if (p.match(/day/)) {
                        if (cronparts[0]) {
                            cronparts.splice(1, 0, `${v},`);
                        } else {
                            cronparts.unshift(`${v},`);
                        }
                    }
                }
            }
            // check to see if the last cronpart contains a year, if not, add the year from the previous element
            let lastEl = cronparts.length - 1;
            if (cronparts[0] && !cronparts[lastEl].match(/\d{4}/)) {
                cronparts.push(preyear);
            }
            let enumpart = enumparts.join(':');
            let cronpart = (cronparts[1]) ? cronparts.join(' ') : cronparts[0];
            if (enumpart && cronpart) {
                parts.push(`${enumpart} (${cronpart})`);
            } else if (cronpart) {
                parts.push(cronpart);
            } else if (enumpart) {
                parts.push(enumpart)
            }
        });
        let statement = parts.join('-');
        if (open) statement += '-'
        console.log(statement);
    }
}