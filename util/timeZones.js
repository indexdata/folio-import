let inDate = process.argv[2];
if (!inDate) {
    throw new Error(`Usage: timeZones.json <yyyymmdd>`);
}

const parseDate = (dstr, type) => {
    let dt = '';
    dstr = dstr.replace(/^(....)(..)(..)/, '$1-$2-$3');
    let dto = new Date(dstr)
    try {
    let dzo = dto.getTimezoneOffset()/60;
    // console.log('Timezone Offset:', dzo);
    let pto = (dzo > 0) ? `-0${dzo}:00` : (dzo < 0) ? `+0${dzo}:00` : 'Z'
    pto = pto.replace(/\+0-/, '+0');	    
    dt = dto.toISOString();
    dt = (type === 'due') ? dt.replace(/T.+/, `T23:59:59.000${pto}`) : dt.replace(/T.+/, `T12:00:00.000${pto}`);
    } catch (e) {
    console.log(`${e} : ${dstr}`);
    dt = 'ERR';
    }
    return(dt);
}

let dd = parseDate(inDate, 'due');
let ld = parseDate(inDate, 'loan');
console.log('Due date:', dd);
console.log('Out date:', ld);
