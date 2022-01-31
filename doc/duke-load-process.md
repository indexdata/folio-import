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

TODO: If the sequence number of the files is important, then need to aggregate-and-split differently. The current filenames do not sort in sequence.

```
jq -c '.[]' *bulk-instance.jsonl > ${DATA_DUKE}/all-instances.jsonl
jq -c '.[]' *bulk-source*.jsonl > ${DATA_DUKE}/all-source.jsonl
jq -c '.[]' *bulk-holdings.jsonl > ${DATA_DUKE}/all-holdings.jsonl
jq -c '.[]' *bulk-items.jsonl > ${DATA_DUKE}/all-items.jsonl
jq -c '.[]' *bulk-bound-with.jsonl > ${DATA_DUKE}/all-bound-with.jsonl
```

Split into sets of 6 data files ready for the multi-process runner (optimised for 6).
split -d --number=l/6 all-instances.jsonl instance

TODO: Fix the following instructions to use the aggregated-and-split data files.

## Load instances

```
./run_inventory.sh data-duke/instance*
```

## Load SRS

```
./run_load_jsonl.sh source-storage/records data-duke/*bulk-source*.jsonl
```

## Load holdings

```
./run_inventory.sh data-duke/*bulk-holdings.jsonl
```

## Load items

```
./run_inventory.sh data-duke/*bulk-items.jsonl
```

## Load bound-with

```
node loadJSONL.js inventory-storage/bound-with-parts data-duke/all-bound-with.jsonl
```

## Migration documentation

Create a Gdoc and link to the ticket.

