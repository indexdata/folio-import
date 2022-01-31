const isbn = process.argv[2];
if (!isbn) {
  console.log('Usage: node isbnValidator.js <isbn>');
}

const isbnCheck = (isbn) => {
  isbn = isbn.replace(/-/g, '');
  let digits = isbn.split('');
  let len = digits.length;
  let checkDigit = digits.pop();
  checkDigit = checkDigit.replace(/[Xx]/, '10');
  let sums = 0;
  let dcount = 0;
  let multiplier = 0;
  let ten = 10;
  let check;
  digits.forEach(d =>{
    dcount++;
    n = parseInt(d, 10);
    if (len === 13) {
      if (dcount % 2 === 0) {
        multiplier = 3;
      } else {
        multiplier = 1;
      }
      let prod = n * multiplier;
      sums += prod;
    } else {
      sums += ten * n;
      ten--;
    }
  });
  if (len === 13) {
    let rem = sums % 10;
    check = 10 - rem;
    if (rem === 0) check = 0;
  } else {
    let rem = sums % 11;
    check = 11 - rem;
  }
  if (check === parseInt(checkDigit, 10)) {
    return true;
  } else {
    return false;
  }
}

if (isbnCheck(isbn)) { 
  console.log(`${isbn} is valid`);
} else {
  console.log(`WARN ${isbn} in not valid`);
}