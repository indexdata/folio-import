# Migration process

This is a general overview of the data migration procedures.
For example STC "test" [DEVOPS-4123](https://index-data.atlassian.net/browse/DEVOPS-4123).

Engage Index Data to assist with or carry out the migration. There are bespoke tools to suit each customer situation, and there is arcane knowledge with this process.

## Table of contents

<!-- md2toc -l 2 -h 3 doc/migration_process.md -->
* [Preparation](#preparation)
* [Notes](#notes)
* [Download reference data](#download-reference-data)
* [Clean the system](#clean-the-system)
* [Reload reference data](#reload-reference-data)
* [Verify reference data](#verify-reference-data)
* [Load inventory](#load-inventory)
    * [Obtain the inventory data](#obtain-the-inventory-data)
    * [Setup and prepare inventory data](#setup-and-prepare-inventory-data)
    * [Split inventory data files](#split-inventory-data-files)
    * [Load inventory data](#load-inventory-data)
    * [Document the inventory counts](#document-the-inventory-counts)
    * [Visit the UI for quick inventory inspection](#visit-the-ui-for-quick-inventory-inspection)
* [Load users](#load-users)
    * [Obtain the users data](#obtain-the-users-data)
    * [Setup and prepare users data](#setup-and-prepare-users-data)
    * [Split users data files](#split-users-data-files)
    * [Load users data](#load-users-data)
    * [Ensure that users loaded](#ensure-that-users-loaded)
    * [Load users notes](#load-users-notes)
    * [Document the users counts](#document-the-users-counts)
    * [Visit the UI for quick users inspection](#visit-the-ui-for-quick-users-inspection)
* [Load checkouts](#load-checkouts)
    * [Obtain the loans data](#obtain-the-loans-data)
    * [Create the checkout-by-barcode objects](#create-the-checkout-by-barcode-objects)
    * [Split checkouts data files](#split-checkouts-data-files)
    * [Activate the inactive checkout users](#activate-the-inactive-checkout-users)
    * [Do the checkouts](#do-the-checkouts)
    * [Timer will do aged-to-lost](#timer-will-do-aged-to-lost)
    * [Visit the UI for quick loans inspection](#visit-the-ui-for-quick-loans-inspection)
    * [Ensure that checkouts have completed](#ensure-that-checkouts-have-completed)
    * [Deactivate the inactive checkout users](#deactivate-the-inactive-checkout-users)
    * [Count the loans](#count-the-loans)
    * [Document the checkouts counts](#document-the-checkouts-counts)
* [Load feefines bills](#load-feefines-bills)
    * [Obtain the fees data](#obtain-the-fees-data)
    * [Create the actual-cost bills](#create-the-actual-cost-bills)
    * [Load the bills data](#load-the-bills-data)
    * [Visit the UI for quick feefines inspection](#visit-the-ui-for-quick-feefines-inspection)
    * [Change the account dates](#change-the-account-dates)
    * [Load feefines accounts and actions](#load-feefines-accounts-and-actions)
    * [Document the feefines counts](#document-the-feefines-counts)
* [Load course reserves](#load-course-reserves)
    * [Obtain the course reserves data](#obtain-the-course-reserves-data)
    * [Create the courses objects](#create-the-courses-objects)
    * [Load the courses data](#load-the-courses-data)
    * [Visit the UI for quick courses inspection](#visit-the-ui-for-quick-courses-inspection)
    * [Count the courses](#count-the-courses)
    * [Document the courses counts](#document-the-courses-counts)
* [Load authorities](#load-authorities)
    * [Obtain the authorities data](#obtain-the-authorities-data)
    * [Create the authorities objects](#create-the-authorities-objects)
    * [Split authorities data files](#split-authorities-data-files)
    * [Load authorities data](#load-authorities-data)
    * [Load authorities source record storage](#load-authorities-source-record-storage)
    * [Reload any authorities errors](#reload-any-authorities-errors)
    * [Visit the UI for quick authorities inspection](#visit-the-ui-for-quick-authorities-inspection)
    * [Document the authorities counts](#document-the-authorities-counts)

## Preparation

* Do 'git pull' for local clone of [folio-import](https://github.com/indexdata/folio-import) and on the prod-bastion host.
* Do 'cd ~/folio-import; npm install'
* Add a special log directory: `mkdir -p ~/folio-import/log`
* Copy the spreadsheets from a previous dry-run:
    * Store at Gdrive "STC FOLIO Migration > Project Management"
    * e.g. to be "STC dry run checklist YYYY-MM-DD" and "STC Dry Run Tasks YYYY-MM-DD".
* Get some separate iTerm windows and do 'ssh prod-bastion' etc.
    * One at `~/folio-import` for running the commands.
    * Two at `~/stc` for process monitoring, e.g. succ.sh, err.sh
* Browser window for the management spreadsheets.
* Ensure tenant configuration credentials, e.g. `~/folio-import/configs/json/stc-test.json`
    * Add "syscreds" for the relevant system users.
* Move old data to separate directories:
    * e.g. ~/stc/incoming-dryrun1
    * e.g. ~/stc/all-ref-dryrun1
    * e.g. ~/stc/log-dryrun1
* Clean prod-bastion workspace at ~/stc
    * Do: `make really-clean`

## Notes

See some actual script and endpoint commands in spreadsheet "STC dry run checklist".

Consider using '[screen](https://github.com/indexdata/id-folio-infrastructure/blob/master/runbooks/screen.md)' for each workspace and daily session. Useful for keeping interaction logs, and useful if we get disconnected from ssh.

## Download reference data

On the prod-bastion host, do:

```
cd ~/folio-install
./show_config.sh   # and ensure relevant login credentials
mkdir -p ../stc/all-ref
node downloadRefData.js ../stc/all-ref > ../stc/log/downloadRefData.log 2>&1
```

At localhost, ensure up-to-date mapping tables for locations, mtypes, and groups in TSV format. Ensure up-to-date with the customer implementation spreadsheet. Download each relevant worksheet and diff with those at `stc/etc/*.tsv` files. Commit.

## Clean the system

The FOLIO system is then wiped out to prepare for the next dry-run. See spreadsheet "STC Dry Run Tasks".

## Reload reference data

The previous task [Download reference data](#download-reference-data) will have created a list of sub-directories with names beginning with numbers to enable a specific sort order.

If they are not using a certain FOLIO module then there will not be any downloaded files, although an empty all-ref/xx directory will be probably be created.

The reference data can be loaded in that sorted order, or with local knowledge in some other order.
The loading is done via `loadRefData.js` using commands of this form:\
`node loadRefData.js ../stc/all-ref/07-patron_blocks_module/*.json`

For some, with local knowledge specific files can be avoided.

Review the outputs. For some (e.g. tags and patron_blocks) there will be errors because these data are already in the system, loaded via the module itself.

The "nn-permissions" is different. We are only interested in "mutable" permissions, and we do not need to use the perms__users.json file. Do the load via:\
`node loadMutablePerms.js ../stc/all-ref/permissions/perms__permissions.json`

At the end, do the "`system_users`".

Document the counts.

## Verify reference data

The next step is for people with the knowledge to conduct a review via the UI. This takes time.

## Load inventory

Some steps will utilise the `~/stc/Makefile`
(symlink to [~/folio-import/etc/stc/Makefile](https://github.com/indexdata/folio-import/blob/master/etc/stc/Makefile))
while other steps will run specific scripts.

### Obtain the inventory data

At the FTP server `ftp.folio.indexdata.com` the customer will have moved old data to a sub-directory.

On the prod-bastion host, do:

```
cd ~/stc/incoming
./ftp.sh  # and get the "inventory" data files
```

### Setup and prepare inventory data

Do: `make setup`

That will get all the reference data and locations and stuff into ~/stc/ref/ directories.

Do: `make instances`

That will link up the data files into sensible filenames, and convert into ~/stc/ref/inv/bibs.mrc file, and count the records.

It will run `inventory2/marc2inst-stc.js` to create instances, snapshot, and SRS, presuc objects from the legacy source.

In this case there were no errors reported. If there were errors, then would most likely be due to duplicate records.

Do: `make items`

That will link up the data files into sensible filenames.

It will run `inventory2/holdingsItems-stc.js` to create items and holdings from the legacy flat text files.

In this case there was only one error reported, due to a missing mapping in locations.tsv file. That will get mapped to "Unmapped" location. The customer can then followup later to search for those and fix them.

Add the counts to the "STC dry run checklist" spreadsheet at the "Expected" column.

### Split inventory data files

We can speed up the processing with parallel ingest. There are five instances of the relevant FOLIO inventory module.

Calculate the numbers for each type, to split into 5 files, e.g. 81307/5 is approximately 17000.

```
cd ~/stc/inv
split -l 17000 bibs-instances.jsonl inst
split -l 17000 bibs-srs.jsonl srs
split -l 25000 items-holdings.jsonl hold
split -l 25000 items-items.jsonl item
```

### Load inventory data

First, double-check that communications and credentials are appropriate:

```
cd ~/folio-import
./show_config.sh
```

Now load the various files:

```
cd ~/folio-import
./run_inventory.sh ../stc/inv/insta?
```

Check the results for success and errors. There are two utility scripts on the PATH: succ.sh and err.sh

```
succ.sh ~/stc/log/insta*log
err.sh ~/stc/log/insta*log
```

Similarly load the other data and check for errors:

```
./run_inventory.sh ../stc/inv/holda?
./run_inventory.sh ../stc/inv/itema?
```

Now load the preceding/succeeding titles:

```
./run_post_jsonl.sh _/preceding-succeeding-titles ../stc/inv/bibs-presuc.jsonl
succ.sh ~/stc/log/bibs-presuc.jsonl.log
err.sh ~/stc/log/bibs-presuc.jsonl.log
```

Now load the source record storage SRS data. This will take longer time:

First the snapshot:

```
./run_post_jsonl.sh _/source-storage__snapshots ../stc/inv/bibs-snapshot.jsonl
succ.sh ~/stc/log/bibs-snapshot.jsonl.log
err.sh ~/stc/log/bibs-snapshot.jsonl.log
```

Then the SRS records:

```
./run_post_jsonl.sh _/source-storage__records ../stc/inv/srsa?
succ.sh ~/stc/log/srsa*log  # repeat occasionally until finished
err.sh ~/stc/log/srsa*log
```

### Document the inventory counts

Do the following queries and obtain the "totalRecords" count:

```
node get.js _/instance-storage__instances | jq '.totalRecords'
node get.js _/holdings-storage__holdings | jq '.totalRecords'
node get.js _/item-storage__items | jq '.totalRecords'
node get.js _/preceding-succeeding-titles | jq '.totalRecords'
node get.js _/source-storage__records | jq '.totalRecords'
```

Add the counts to the "STC dry run checklist" spreadsheet at the "Added" column.

Also add the timing Start/End for the source records operation.
In this case do not bother with the other operations as they were so fast.

### Visit the UI for quick inventory inspection

Login to UI and inspect some records.

Go "Inventory > Instances", select some and do "View holdings" and "Actions > View source".

Go "Effective location" and inspect the list.

Go "Item > Material type" and inspect the list.

## Load users

Some steps will utilise the Makefile, while other steps will run specific scripts.

### Obtain the users data

On the prod-bastion host, do:

```
cd ~/stc/incoming
./ftp.sh  # and get the "Users" data files
```

### Setup and prepare users data

```
cd ~/stc
make setup
make users
```

That will report the number of users and notes created in `~/stc/usr` directory.

### Split users data files

As before, make five batches.

```
cd ~/stc/usr
split -l 8000 users-users.jsonl user
split -l 8000 users-perms.jsonl perm
split -l 8000 users-request-prefs.jsonl pref
```

The notes file is small, so no need.

### Load users data

First, double-check that communications and credentials are appropriate:

```
cd ~/folio-import
./show_config.sh
```

Now load the various files:

```
cd ~/folio-import
./run_post_jsonl.sh users ../stc/usr/usera?
```

Check the results for success and errors. (Have a separate terminal window for running these checks.)

```
succ.sh ~/stc/log/usera*log
err.sh ~/stc/log/usera*log
```

Repeat until finished.

Still doing users, but can do permissions while that is happening.

```
./run_post_jsonl.sh perms/users ../stc/usr/perma?
```

Repeat the succ/err dance.

Can load request preference while that is happening.

Use the beaut prompt completion facility.

```
./run_post_jsonl.sh _/request-preference-storage__request-preference ../stc/usr/prefa?
```

Repeat the succ/err dances.

### Ensure that users loaded

```
cd ~/folio-import
node get users | jq '.totalRecords'
```

The count will be off because some users were already in there.

```
node get perms/users | jq '.totalRecords'
node get _/request-preference-storage__request-preference | jq '.totalRecords'
cat ../stc/log/makeUsers.log
```

### Load users notes

```
./run_post_jsonl.sh notes ../stc/usr/users-notes.jsonl
tail -f ../stc/log/users-notes.jsonl.log
```

### Document the users counts

Add the counts to the "STC dry run checklist" spreadsheet at the "Added" column.

### Visit the UI for quick users inspection

Login to UI and inspect some records.

Go "Users" select Active and Inactive. Select some.

Should have 0 permissions.

Look at "Extended information" has Request preferences ... hold shelf:yes Delivery:no

Let customer decide that all is well.

## Load checkouts

Some steps will utilise the Makefile, while other steps will run specific scripts.

### Obtain the loans data

On the prod-bastion host, do:

```
cd ~/stc/incoming
./ftp.sh  # and get the "Loans" data file
wc -l Loans*.txt
```

### Create the checkout-by-barcode objects

The Makefile will download users and items from FOLIO. It could have changed stuff after our earlier load, and we need barcodes etc. Then it will make the checkouts.

```
cd ~/stc
make clean-checkouts
make checkouts
```

That will report the number of checkouts and inactive users.

### Split checkouts data files

As before, make five batches.

```
cd ~/stc/circ
split -l 500 checkouts.jsonl chk
```

### Activate the inactive checkout users

Changes the relevant users to be active, and sets the expiry date to way in the future.

```
cd ~/folio-import
./show_config.sh
node usersActiveToggle.js ../stc/circ/inactive-checkouts.jsonl
```

### Do the checkouts

This does not log to normal log directory, but to the ~/stc/circ directory.

```
./run_checkouts.sh ../stc/circ/chka?
```

This grabs the loan object, and changes the due date to whatever is in the checkout record.
Sometimes it will encounter a "block", but the script knows how to override it.

```
cd ~/stc/circ
tail -f chkaa.log  # Follow one for example
```

Inspect the results. Hopefully the `chka*.err` files will be empty.

```
tail chka*.err
tail -n 4 chka*.log
```

### Timer will do aged-to-lost

The FOLIO timer runs every 30 minutes to do the aged-to-lost operation.

We cannot do the "feefines" until those are completed, which could take some time.

Visit UI `/users/lost-items`

### Visit the UI for quick loans inspection

Login to UI.

Visit the "Circulation log" and select "Loan > Changed due date". Note that this is not an accurate count.

Then select "Loan > Aged to lost" ... probably none yet.

### Ensure that checkouts have completed

```
cd ~/stc/circ
tail chka*.log
```

### Deactivate the inactive checkout users

```
cd ~/folio-import
node usersActiveToggle.js ../stc/circ/inactive-checkouts.jsonl
```

### Count the loans

The circulation log does not give and accurate count, so use the API.
The result should match the count from earlier in this section.

```
node get _/loan-storage__loans node | jq '.totalRecords'
```

### Document the checkouts counts

Add the counts of checkouts and inactive users to the "STC dry run checklist" spreadsheet at the "Added" column.

## Load feefines bills

> [!CAUTION]
> NOTE: Wait for aged-to-lost:

Need to wait until the "Aged to lost" process has completed (see explanation above) which might even be the next day.
Could move on to do courses and authorities while waiting.

Some steps will utilise the Makefile, while other steps will run specific scripts.

### Obtain the fees data

```
cd ~/stc/incoming
./ftp.sh  # and get the "Fees" data files
wc -l Fees*.txt
```

### Create the actual-cost bills

The Makefile will download relevant users and items from FOLIO. Then it will make the bills objects.
Thois needs to get new users and items files because their status changed.

```
cd ~/stc
make feefines
cd ~stc/fines
ls
```

### Load the bills data

```
cd ~/folio-import
./show_config.sh
./run_post_jsonl.sh _/actual-cost-fee-fine__bill ../stc/fines/bills.jsonl
tail -f ~/stc/log/bills.jsonl.log
```

### Visit the UI for quick feefines inspection

Login to UI.

Visit "Users" and "Actions > Lost items requiring actual cost" and then select "Status > Billed".

At a user record, select via ellipsis the "Patron details" Loans. Visit the "Fees/Fines" section.

### Change the account dates

```
cd ~/folio-import
node changeActionDates.js ../stc/fines/actionDates.jsonl
```

### Load feefines accounts and actions

```
./run_post_jsonl.sh _/accounts ../stc/fines/accounts.jsonl
./run_post_jsonl.sh _/feefineactions ../stc/fines/feefineActions.jsonl
```

Visit the corresponding logs.

### Document the feefines counts

Add the counts of feefines to the "STC dry run checklist" spreadsheet at the "Added" column.

## Load course reserves

Some steps will utilise the Makefile, while other steps will run specific scripts.

### Obtain the course reserves data

On the prod-bastion host, do:

```
cd ~/stc/incoming
./ftp.sh  # and get the "Course Reserves" data files
wc -l Course*.txt
```

### Create the courses objects

The Makefile will download relevant users and items from FOLIO. Then it will make the courses.

```
cd ~/stc
make course-reserves
```

There will not be a large number, so no need to split files.

### Load the courses data

```
cd ~/folio-import
./show_config.sh
node loadCourses.js ../stc/courses/loadCourses.json
```

Review `~/stc/log/loadCourses.log`

### Visit the UI for quick courses inspection

Login to UI.

Visit "Courses"

### Count the courses

```
node get _/coursereserves__courses | jq '.totalRecords'
node get _/coursereserves__reserves | jq '.totalRecords'
```

### Document the courses counts

Add the counts of courses to the "STC dry run checklist" spreadsheet at the "Added" column.

## Load authorities

Some steps will utilise the Makefile, while other steps will run specific scripts.

### Obtain the authorities data

On the prod-bastion host, do:

```
cd ~/stc/incoming
./ftp.sh  # and get the "Authorities*.xml" data file
```

### Create the authorities objects

The Makefile will generate the authorities MARC from the XML, and create authority objects from raw MARC, and will report the count.

```
cd ~/stc
make authorities
```

There will likely be many warnings about duplicates, that is fine, actually the same records.

### Split authorities data files

As before, make five batches.

```
cd ~/stc/auth
split -l 70000 auth-authorities.jsonl auth
split -l 70000 auth-srs.jsonl asrs
```

### Load authorities data

```
cd ~/folio-import
./show_config.sh
./run_post_jsonl.sh _/authority-storage__authorities ../stc/auth/autha?
```

Do the succ/err dance.

Sometimes there will be timeouts. That will create error files, which we can reload (see following section).

```
grep -i error ~/stc/log/autha*log | wc -l
grep -i error ~/stc/log/autha*log
... proxyClient failure
```

This will take a long time. We can do the next section while that is still running.

### Load authorities source record storage

First load the snapshot to prepare for SRS.

```
cd ~/folio-import
./run_post_jsonl.sh _/source-storage__snapshots ../stc/auth/auth-snapshot.jsonl
cat ~/stc/log/auth-snapshot.jsonl.log
```

Expect no errors.

Now load the authorities SRS:

```
./run_post_jsonl.sh _/source-storage__records ../stc/auth/asrsa?
```

Do the succ/err dance.

### Reload any authorities errors

As explained earlier, there could be loading errors, e.g. timeouts.

```
cd ~/stc/auth
cat *Err.jsonl > authErrs.jsonl
wc -l authErrs.jsonl

cd ~/folio-import
./run_post_jsonl.sh _/authority-storage__authorities ../stc/auth/authErrs.jsonl
tail ../stc/log/authErrs.jsonl.log
```

There might be remaining errors. Go again:

```
./run_post_jsonl.sh _/authority-storage__authorities ../stc/auth/authErrsErr.jsonl
```

### Visit the UI for quick authorities inspection

Login to UI.

Visit "MARC authority" and glance at some records.

### Document the authorities counts

Add the counts of authorities to the "STC dry run checklist" spreadsheet at the "Added" column.

---

## Old notes

Note: The following sections are old notes, gradually being replaced with new sections above.

## Inventory

* DOWNLOAD data (.mrc, .csv, etc) from `ftp.folio.indexdata.com`.  NOTE: credentials should be in LastPass
* LINK or rename downloaded files [optional]
* PREPROCESS files (ie: convert MARC to UTF8, XLSX to CSV...) [optional]
* GET reference data from FOLIO by running `node migrationRef.js`
* SAVE mapping tables for locations, mtypes and statuses in tsv format.
    * Ensure up-to-date with the customer implementation spreadsheet.
    * Download each relevant worksheet and diff with those at `stc/etc/*.tsv`
* RUN the `marc2inst.js` script in the inventory2 directory to create instance, preceding-succeeding-titles, snapshots, and SRS obects.  NOTE: marc2inst.js requires a config file which tells the script where to find reference data and tsv maps along with settings for hrid prefix, namespace, etc.  NOTE2: tsv files are stored in the etc directory.
* RUN holdings/items creation script or scripts.  NOTE: These scripts will be unique to each institution
* GZIP the jsonl files recently created by marc2inst and holdingsItems scripts [optional]
* SCP the zipped (or unzipped) files to the folio staging server at folio-bastion.folio-us-east-1-1.folio.indexdata.com
* SPLIT large files into multiple (usually 5) smaller ones [optional]
* SELECT proper communications setting by running `./show_config.sh`.
* ENABLE logging by setting the `logpath` property in `config.json` [optional]
* RUN `./run_inventory.sh` on instance file(s)
* RUN `./run_inventory.sh` on holdings file(s)
* RUN `./run_inventory.sh` on item file(s)
* RUN `./run_post_jsonl.sh` on presuc file(s)
* RUN `./run_post_jsonl.sh` on bound-with-parts file(s)
* RUN `./run_post_jsonl.sh` on instance-relationships file(s)
* RUN `./run_post_jsonl.sh` on snapshot file
* RUN `./run_post_jsonl.sh` on srs file(s)
