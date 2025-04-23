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
./show_config.sh   # and ensure relevant login credentials
mkdir -p ../stc/all-ref
node downloadRefData.js ../stc/all-ref
```

## Clean the system

The system is then wiped out to prepare for the next dry-run. See spreadsheet "STC Dry Run Tasks".

## Reload reference data

The previous task [Download reference data](#download-reference-data) will have created a list of sub-directories with names beginning with numbers to enable a specific sort order.

If they are not using a certain FOLIO module then there will not be any downloaded files, although an empty all-ref/xx directory will be probably be created.

The reference data can be loaded in that sorted order, or with local knowledge in some other order.
The loading is done via `loadRefData.js` using commands of this form:\
`node loadRefData.js ../stc/all-ref/07-patron_blocks_module/*.json`

For some, with local knowledge specific files can be avoided.

Review the outputs. For some (e.g. tags and patron_blocks) there will be errors because these data are already in the system, loaded via the module itself.

The "nn-permissions" is different. We are only interested in "mutable" permissions, and we do not need to use the perms__users.json file. Do the load towards the end of this section via:\
`node loadMutablePerms.js ../stc/all-ref/permissions/perms__permissions.json`

At the end, do the "`system_users`".

## Verify reference data

The next step is for people with the knowledge to conduct a review via the UI. This takes time.

## Old notes

Note: The following sections are old notes, gradually being replaced with new sections above.

----

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
