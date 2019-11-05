#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

UUID=$1;
if [ -z $UUID ]
  then
    echo "Usage: $0 <instanceId>"
    exit
fi

curl -w '\n' --http1.1 "${OKAPI}/holdings-storage/holdings?query=instanceId%3D%3D${UUID}" -H "x-okapi-token: ${TOKEN}"
