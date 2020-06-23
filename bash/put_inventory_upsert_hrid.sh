#!/bin/bash

FILE=$1;
if [ -z $FILE ]
  then
    echo "Usage: ${0} <inventory_set>"
    exit
fi

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

for f in ${BASH_ARGV[*]}; do
  echo "Loading ${f}"
  curl -v --http1.1 -X PUT "${OKAPI}/inventory-upsert-hrid" -H 'content-type: application/json' -H "x-okapi-token: ${TOKEN}" -d @$f
done
