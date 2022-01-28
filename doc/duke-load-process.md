# Duke data load process

## Overview

Duke staff will prepare the data files as JSONL and put on FTP.
Index Data staff will load to FOLIO.

## Configure workspace

Add some env for the rest of this procedure:

```
export DATA_DUKE=/data/duke
```

TODO: Fix duke-dev passwords

```
cd ~/folio-import
git pull
cp configs/js/duke-dev.js config.js
# in config.js use: logpath: '/data/duke/log'
cp configs/bash/login-duke-dev.sh bash

ln -sf ${DATA_DUKE} data
ln -sf ${DATA_DUKE}/log log
```

## Assess and prepare data

```
ssh dev-bastion  # i.e. as your user
cd /data/sftpusers/duke

# List the types of data file
ls *bulk*.jsonl | sed -E 's/\.jsonl//; s/^[0-9]+-//; s/-[0-9]+$//' \
  | sort | uniq > ${DATA_DUKE}/log/filenames.txt
```

Do initial verification:

```
/data/duke/verify-delivered.sh *bulk*.jsonl
```

Aggregate the data as proper JSONL and verify.

TODO: If the sequence number of the files is important, then need to aggregate-and-split differently. The current filenames do not sort in sequence.

```
jq -c '.[]' *bulk-instance.jsonl > ${DATA_DUKE}/all-instances.jsonl
jq -c '.[]' *bulk-source*.jsonl > ${DATA_DUKE}/all-source.jsonl
jq -c '.[]' *bulk-holdings.jsonl > ${DATA_DUKE}/all-holdings.jsonl
jq -c '.[]' *bulk-items.jsonl > ${DATA_DUKE}/all-items.jsonl
jq -c '.[]' *bulk-bound-with.jsonl > ${DATA_DUKE}/all-bound-with.jsonl
```

TODO: Split into sets of 6 data files ready for the multi-process runner (optimised for 6).

TODO: Do we need to verify anything more before proceeding?

TODO: Fix the following instructions to use the aggregated-and-split data files.

## Load instances

```
./run_inventory.sh data/*bulk-instance.jsonl
```

## Load SRS

```
./run_load_jsonl.sh source-storage/records data/*bulk-source*.jsonl
```

## Load holdings

```
./run_inventory.sh data/*bulk-holdings.jsonl
```

## Load items

```
./run_inventory.sh data/*bulk-items.jsonl
```

## Load bound-with

TODO: ???

## Migration documentation

Create a Gdoc and link to the ticket.

