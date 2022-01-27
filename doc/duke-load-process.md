# Duke data load process

## Overview

Duke staff will prepare the data files as JSONL and put on FTP.
Index Data staff will load to FOLIO.

## Configure workspace

TODO: Someone with power:
```
mkdir /data/duke
chmod g+s /data/duke
chgrp admin /data/duke
mkdir /data/duke/log
```

Add some env for the rest of this procedure
```
# export LOG_DUKE=/data/duke/log
export LOG_DUKE=/data/spl/log/duke
```

TODO: Fix duke-dev passwords

```
cd ~/folio-import
git pull
cp configs/js/duke-dev.js config.js
# in config.js use: logpath: '/data/duke/log'
cp configs/bash/login-duke-dev.sh bash

ln -sf /data/sftpusers/duke data
ln -sf ${LOG_DUKE} log
```

## Assess data

```
ssh dev-bastion  # i.e. as your user
cd /data/sftpusers/duke

# List the types of data file
ls *.jsonl | sed -E 's/\.jsonl//; s/^[0-9]+-//; s/-[0-9]+$//' \
  | sort | uniq > ${LOG_DUKE}/filenames.txt
```

TODO: Do we need to verify anything before proceeding?

## Load instances

QUERY: Should those many files be aggregated into a few sets?
Otherwise will be 14 for the multi-process runner.

I think we're optomized at 6 processes, so maybe some of thoses files should be joined.

```
./run_inventory.sh data/*bulk-instance.jsonl
```

## Load SRS

QUERY: Should those many files be aggregated into sets: 0-bulk-instance.jsonl 1-bulk-instance.json etc.?

Yes, like above, let's shoot for 6 files.

```
./run_load_jsonl.sh source-storage/records data/*bulk-source*.jsonl
```

## Load holdings

QUERY: Should those many files be aggregated into a few sets? As above.

Yes.

```
./run_inventory.sh data/*bulk-holdings.jsonl
```

## Load items

QUERY: Should those many files be aggregated into a few sets? As above.

Yes.

```
./run_inventory.sh data/*bulk-items.jsonl
```

## Load bound-with

TODO: ???

## Migration documentation

Create a Gdoc and link to the ticket.

