/*

Create a default credentials file based on folio users records.  The password will be 'changeMe'

*/

const usersFile = process.argv[2];
if (!usersFile) {
  console.log('Usage: node changeMe.js <user_file.json>');
}
let users = require(usersFile);
if (users.users) {
  users = users.users;
}

creds = [];
users.forEach(u => {
  if (u.username) {
    cred = {
      userId: u.id,
      username: u.username,
      password: 'changeMe'
    }
    creds.push(cred);
  }
});
console.log(JSON.stringify(creds, null, 2));
