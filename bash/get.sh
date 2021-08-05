#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

EP=$1

if [ -z $EP ]
then
  echo "Usage: ${0} <okapi_endpoint> [<id>]"
  exit
fi

if [ $2 ] 
then
  ID="/${2}"
fi

curl --http1.1 -w '\n' -s "${OKAPI}/${EP}${ID}" -H "x-okapi-token: ${TOKEN}"
