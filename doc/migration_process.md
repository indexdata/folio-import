# Migration process

This is a general overview of the data migration procedures.
For example STC "test" [DEVOPS-4123](https://index-data.atlassian.net/browse/DEVOPS-4123).

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

## Preparation

* Do 'git pull' for local clone of [folio-import](https://github.com/indexdata/folio-import) and on the prod-bastion host.
* Do 'cd ~/folio-import; npm install'
* Copy the spreadsheets from a previous dry-run:
    * Store at Gdrive "STC FOLIO Migration > Project Management"
    * e.g. to be "STC dry run checklist YYYY-MM-DD" and "STC Dry Run Tasks YYYY-MM-DD".
* Get some separate iTerm windows and do 'ssh prod-bastion' etc.
* Ensure tenant configuration credentials, e.g. `~/folio-import/configs/json/stc-test.json`
    * Add "syscreds" for the relevant system users
* Move old data to separate directories:
    * e.g. ~/stc/incoming-dryrun1
    * e.g. ~/stc/all-ref-dryrun1
    * e.g. ~/stc/log-dryrun1
* Clean prod-bastion workspace at ~/stc
    * Do: `make really-clean`

## Notes

See some actual script and endpoint commands in spreadsheet "STC dry run checklist".

## Download reference data

On the prod-bastion host, do:

```
cd ~/folio-install
./show_config.sh   # and ensure relevant login credentials
mkdir -p ../stc/all-ref
node downloadRefData.js ../stc/all-ref
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

It will run `/inventory2/holdingsItems-stc.js` to create items and holdings from the legacy flat text files.

In this case there was only one error reported, due to a missing mapping in locations.tsv file. That will get mapped to "Unmapped" location. The customer can then followup later to search for those and fix them.

Add the counts to the "STC dry run checklist" spreadsheet at the "Expected" column.

### Split inventory data files

We can speed up the processing with parallel ingest. There are five instances of the relevant FOLIO inventory module.

Calculate the numbers for each type, to split into 5 files, e.g. 81307/5 is approximately 17000.

```
cd ~/stc/inv
split -l 17000 bibs-instances.jsonl inst
split -l 17000 bibs-src.jsonl srs
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
./run_post_jsonl.sh _/source-storage__records ../stc/inv/srca?
srs.sh ~/stc/log/srsa*log  # repeat occasionally until finished
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

Login to stc-test UI and inspect some records.

Go "Inventory > Instances", select some and do "View holdings" and "Actions > View source".

Go "Effecive location" and inspect the list.

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
node get users
```

The count will be off because some users were already in there.

```
node get perms/users
node get _/request-preference-storage__request-preference
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

Login to stc-test UI and inspect some records.

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
node usersActiveToggle.js ../stc/circ/inactive-checkouts.jsonl
```

### Do the checkouts

This does not log to normal log directory, but to the ~/stc/circ directory.

```
./run_checkouts.sh ../stc/circ/chka?
```

This grabs the loan object, and changes the due date to whatever is in the checkout record.
Sometimes it will encounter a "block", but the script knows how to override it.

Inspect the results. Hopefully the `chka*.err` files will be empty.

```
cd ~/stc/circ
tail -f chkaa.log  # Follow one for example
```

### Timer will do aged-to-lost

The FOLIO timer runs every 30 minutes to do the aged-to-lost operation.

We cannot do the "feefines" until those are completed, which could take some time.

### Visit the UI for quick loans inspection

Login to stc-test UI.

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
node get _/loan-storage__loans
```

### Document the checkouts counts

Add the counts of checkouts and inactive users to the "STC dry run checklist" spreadsheet at the "Added" column.


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
