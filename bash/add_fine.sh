#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

UFILE=$1;
if [ -z $UFILE ]
  then
    echo "Usage: $0 <fine_file>"
    exit
fi
if [ ! -f $UFILE ]
  then
    echo 'File not found'
    exit;
fi

curl -D - -w '\n' --http1.1 "${OKAPI}/accounts" -H 'content-type: application/json' -H "x-okapi-token: ${TOKEN}" -d @$UFILE
