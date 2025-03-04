## Inventory process:

* Download data (.mrc, .csv, etc) from ftp.folio.indexdata.com.  NOTE: credentials should be in LastPass
* LINK or rename downloaded [optional]
* PREPROCESS files (ie: convert MARC to UTF8, XLSX to CSV...) [optional]
* GET reference data from FOLIO by running migrationRef.js
* SAVE mapping tables for locations, mtypes and statuses in tsv format [optional]
* RUN the marc2inst.js script in the inventory2 directory to create instance, preceding-succeeding-titles, snapshots, and SRS obects.  NOTE: marc2inst.js requires a config file which tells the script where to find reference data and tsv maps along with settings for hrid prefix, namespace, etc.  NOTE2: tsv files are stored in the etc directory.
* RUN holdings/items creation script.  These scripts will be bespoke
* GZIP the jsonl files recently created by marc2inst and holdingsItems scripts [optional]
* SCP the zipped (or unzipped) files to the folio staging server at folio-bastion.folio-us-east-1-1.folio.indexdata.com
* SPLIT large files into multiple (usually 5) smaller ones [optional]
* SELECT proper communications setting by running show_config.sh and choosing from the menu
* ENABLE logging by setting the "logpath" property in the config.json file [optional]
* RUN run_nventory.sh on instance file(s)
* RUN run_inventory.sh on holdings file(s)
* RUN run_inventory.sh on item file(s)
* RUN run_post_jsonl.sh on presuc file(s)
* RUN run_post_jsonl.sh on bound-with-parts file(s)
* RUN run_post_jsonl.sh on instance-relationships file(s)
* RUN run_post_jsonl.sh on snapshot file
* RUN run_post_jsonl.sh on srs file(s)

