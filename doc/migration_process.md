# Migration process

This is a general overview of the data migration procedures.
For example STC "test" [DEVOPS-4123](https://index-data.atlassian.net/browse/DEVOPS-4123).

## Preparation

* Do 'git pull' for local clone of [folio-import](https://github.com/indexdata/folio-import) and on the prod-bastion host.
* Copy the spreadsheets from a previous dry-run:
    * Store at Gdrive "STC FOLIO Migration > Project Management"
    * e.g. to be "STC dry run checklist 2025-04-28" and "STC Dry Run Tasks 2025-04-28".
* Get some separate iTerm windows and do 'ssh prod-bastion' etc.
* Ensure tenant configuration credentials, e.g. `~/folio-import/configs/json/stc-test.json`
    * Add "syscreds" for the relevant system users
* Move old data to separate directories:
    * e.g. ~/stc/incoming-dryrun1
    * e.g. ~/stc/all-ref-dryrun1

## Notes

See some actual script and endpoint commands in spreadsheet "STC dry run checklist".

## Download reference data

On the prod-bastion host, do:

```
cd ~/folio-install
./show_config.sh ... and ensure relevant login
mkdir -p ../stc/all-ref
node downloadRefData.js ../stc/all-ref
```

## Clean the system

The system is then wiped out to prepare for the next dry-run. See spreadsheet "STC Dry Run Tasks".

## Re-load reference data

TODO: Overview to come

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
