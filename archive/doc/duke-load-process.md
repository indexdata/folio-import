# Duke data load process

## Overview

Duke staff will prepare the data files as JSONL and put on FTP.
Index Data staff will load to FOLIO.

## Configure workspace

Add some env for the rest of this procedure:

```
export DATA_DUKE=/data/duke
```

```
cd ~/folio-import
git pull
cp configs/js/duke-dev.js config.js
# in config.js use: logpath: '/data/duke/log'
cp configs/bash/login-duke-dev.sh bash

ln -s ${DATA_DUKE} data-duke
ln -s ${DATA_DUKE}/log log
```

Follow the [guide](https://github.com/indexdata/id-folio-infrastructure/runbooks/screen.md) to using "screen" to ensure continued operation of each long-running step.

## Assess and prepare data

```
ssh dev-bastion  # i.e. as your user
cd /data/sftpusers/duke

# List the types of data file
ls *bulk*.jsonl | sed -E 's/\.jsonl//; s/^[0-9]+-//; s/-[0-9]+$//' \
  | sort | uniq > ${DATA_DUKE}/log/filenames.txt
```

Do initial basic verification:

```
/data/duke/verify-delivered.sh *bulk*.jsonl
```

Aggregate the data and verify.

```
jq -c '.[]' *bulk-instance.jsonl > ${DATA_DUKE}/all-instances.jsonl
jq -c '.[]' *bulk-source*.jsonl > ${DATA_DUKE}/all-source.jsonl
jq -c '.[]' *bulk-holdings.jsonl > ${DATA_DUKE}/all-holdings.jsonl
jq -c '.[]' *bulk-items.jsonl > ${DATA_DUKE}/all-items.jsonl
jq -c '.[]' *bulk-bound-with.jsonl > ${DATA_DUKE}/all-bound-with.jsonl
```

TODO: Do some other verification.

## Load instances

Split into sets of data files ready for the multi-process runner (e.g. optimised for six replicas of mod-inventory-storage).

```
split -d --number=l/6 ${DATA_DUKE}/all-instances.jsonl ${DATA_DUKE}/instance
./run_inventory_upsert.sh data-duke/instance*
```

## Load SRS

As above, if there are many records to be loaded, and there are more than one replica of mod-source-record-storage, then split into appropriate number of files.

The SRS data loading will take a long time, so get started early.

Mint a new v4 UUID for "`snapshotId`" (e.g. at [uuidgenerator.net](https://www.uuidgenerator.net/))
and add it to a snapshot-srs.jsonl file. Substitute the placeholder in data records with that UUID.

```
sed -E 's/"snapshotId":"TO BE ADDED"/"snapshotId":"f77e03d6-7b5c-4c2f-b1eb-0c71ca8cf0fc"/' \
  ${DATA_DUKE}/all-source.jsonl > ${DATA_DUKE}/all-srs.jsonl
node loadJSONL.js source-storage/snapshots data-duke/snapshot-srs.jsonl
split -d --number=l/3 ${DATA_DUKE}/all-srs.jsonl ${DATA_DUKE}/srs
./run_load_jsonl.sh source-storage/records data-duke/srs0*
```

## Load holdings

```
split -d --number=l/6 ${DATA_DUKE}/all-holdings.jsonl ${DATA_DUKE}/holding
./run_inventory_upsert.sh data-duke/holding*
```

## Load items

```
split -d --number=l/6 ${DATA_DUKE}/all-items.jsonl ${DATA_DUKE}/item
./run_inventory_upsert.sh data-duke/item*
```

## Load bound-with

```
node loadJSONL.js inventory-storage/bound-with-parts data-duke/all-bound-with.jsonl
```

## Migration documentation

Create a Gdoc and link to the ticket.

