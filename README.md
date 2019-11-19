# folio-import

This is a place to save scripts for loading (migrating) user (and inventory) records.  The project at FOLIO-FSE (https://github.com/FOLIO-FSE) doesn't seem to do everything we need.  (That has some conversion scripts written in Python, but nothing that loads the converted records.)  We may find it a little easier to use JS or Perl to accomplish our goals of converting and loading data.

## Usage

### JavaScript

All JS scripts read the server settings from the config.js file.  If config.js does not exist, the scripts will use config.default.js instead.

Install:
```
$ yarn install
```

Here are the config definitions:
* okapi -- The base okapi url for the targeted system
* authpath -- The path for login (e.g. /bl-users/login, /authn/login)
* tenant -- Okapi tenant on the targeted system
* username -- (e.g. diku_admin)
* password -- (e.g. admin)
* logpath -- Optional path to log file.  This will work on a few scripts that support Winston logging.
* delay -- The time (in ms) to wait between record loads.

Copy the config.default.js file to config.js and set the okapi url to the targeted server.  Tenant, user and password should also be set if not a diku setup.  The delay between actions may be set to 0 if you don't want a delay.  There are a bunch of saved configs for various popular servers in the config directory.

### bash

There is a collection of bash scripts in the bash directory.  There are also a handful of login scripts for various servers.  Run the login script once and a session will be saved to the .okapi directory.  Most of the scripts will read the okapi endpoint and okapi-token from this directory.  These scripts probably won't be used for actually loading, but they are nice for grabbing reference data (e.g. reference_inventory.sh) or deleting all records of a certain type (e.g. delete_all_items.sh).

### perl

Since JS doesn't have any reliable MARC libraries, working with MARC records is best achieved using Perl. So far the scripts only deal with conversion -- nothing talks to okapi.

### downloadAllRefData.js

This programe will consult modual descripters, grab GET endpoints, fetch and store the data returned by the requests.  You just need to supply a path to a directory for storing these data.  The filenames will be the endpoint (forward slashes are converted to %2F) and the module root is added as prefix.

Usage:
```
$ node downloadAllRefData.js <target_directory>
```

### loadRefData.js

This script will load the data fetched by the above script.  It will get the endpoint from the filename, read for the second level arrary object and start loading one reference record at a time.  

Needless to say, order of loading is important.  The user may pick individual files or globs of files as needed.

Usage:
```
$ node loadRefData.js <target_directory/filename(s)>
```

Recommended workflow example:
1) $ node loadRefData.js Refdata/Configuration*
2) $ node loadRefData.js Refdata/users*
3) $ node loadRefData.js Refdata/Inventory_Storage_Module\:location-units%2Finstitutions.json
4) $ node loadRefData.js Refdata/Inventory_Storage_Module\:location-units%2Fcampuses.json
5) $ node loadRefData.js Refdata/Inventory_Storage_Module\:location-units%2Flibraries.json
6) $ node loadRefData.js Refdata/Inventory_Storage_Module\:location-units%2Flocations.json
7) ... the rest of Inventory_Storage_Module ...
8) ... everything else ...

### loadCreds.js

Since mod-user-import does not create credentials records, this script is a way to do so.  It will read a file in "credentials" format and first check to see if the userId exists, and then will POST the credential record to the /authn/credentials.  If a credentials record already exists for the userId, then the script will return a detailed error message.

Usage:
```
$ node loadCreds.js <credentials_file>
```

Example credentials file:
```
[{
  "username" : "CF0084552",
  "userId" : "f42e597f-0c23-4dff-b79c-8656f1f88565",
  "password" : "d22zniMHK"
}, {
  "username" : "CF0084553",
  "userId" : "158dd176-f032-4285-92ac-748a21f12afc",
  "password" : "I80icDruR"
}, {
  "username" : "CF0084554",
  "userId" : "692665a7-6b01-4048-bede-10bccc87134e",
  "password" : "Vj2rrVGn2"
}, {
  "username" : "CF0084556",
  "userId" : "87758226-e8fb-4e51-a8b2-e16bfd196496",
  "password" : "oE3BeuP5s"
}, {
  "username" : "CF0084557",
  "userId" : "3f1e8767-dd73-48eb-bce2-ee04aa978580",
  "password" : "5B84AE6rJ"
}]
```
