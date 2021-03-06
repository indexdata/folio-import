#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

UUID=$1

if [ -z $UUID ] 
  then
    echo 'Usage: ./delete_lost_item_fee.sh <uuid>'
    exit
fi

curl --http1.1 -w '\n' -X DELETE "${OKAPI}/lost-item-fees-policies/${UUID}" -H "x-okapi-token: ${TOKEN}"
