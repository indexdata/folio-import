#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`
ID=$1
if [ ! $ID ]
  then
    echo "Usage: ${0} <snapshot_id>"
    exit;
fi

curl --http1.1 -w '\n' -X DELETE "${OKAPI}/source-storage/snapshots/${ID}" -H "x-okapi-token: ${TOKEN}"
