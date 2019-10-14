const usersFile = process.argv[2];
if (!usersFile) {
  console.log('Usage: node changeMe.js <user_file.json>');
}
let users = require(usersFile);
if (users.users) {
  users = users.users;
}

users.forEach(u => {
  console.log(u);
})
