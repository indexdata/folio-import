#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

UUID=$1;
if [ -z $UUID ]
  then
    echo 'Usage: ./get_holdings.sh <uuid>'
    exit
fi

curl -w '\n' --http1.1 "${OKAPI}/holdings-storage/holdings/${UUID}" -H "x-okapi-token: ${TOKEN}"