#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

UUID=$1;
if [ -z $UUID ]
  then
    echo "Usage: $0 <institution ID>"
    exit
fi


LOCIDS=$(curl -s -w '\n' --http1.1 "${OKAPI}/locations?query=institutionId==${UUID}&limit=100" -H "x-okapi-token: ${TOKEN}")

IDS=$(echo $LOCIDS | jq -r '.locations[] | .id');

for ID in $IDS
do
  echo
  echo $ID
  curl -w '\n' --http1.1 "${OKAPI}/holdings-storage/holdings?query=permanentLocationId==${ID}&limit=0" -H "x-okapi-token: ${TOKEN}"
  echo
  echo '-------'
done

