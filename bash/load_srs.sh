#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

UFILE=$1;
if [ -z $UFILE ]
  then
    echo "Usage: ${0} <srs_file>"
    exit
fi
if [ ! -f $UFILE ]
  then
    echo 'File not found'
    exit;
fi

curl -w '\n' --http1.1 "${OKAPI}/source-storage/records" -H 'content-type: application/json' -H "x-okapi-token: ${TOKEN}" -d @$UFILE
