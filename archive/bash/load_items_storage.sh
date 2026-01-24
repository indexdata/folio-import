#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

UFILE=$1;
if [ -z $UFILE ]
  then
    echo 'Usage: ./load_items_storage.sh <items_file>'
    exit
fi
if [ ! -f $UFILE ]
  then
    echo 'File not found'
    exit;
fi

curl -w '\n' --http1.1 "${OKAPI}/item-storage/items" -H 'content-type: application/json' -H "x-okapi-token: ${TOKEN}" -d @$UFILE
