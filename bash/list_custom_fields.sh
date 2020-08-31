#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

EP='custom-fields'

if [ -z $EP ]
then
  echo "Usage: ${0} <okapi_endpoint> [<id>]"
  exit
fi

if [ $2 ] 
then
  ID="/${2}"
fi

curl --http1.1 -w '\n' "${OKAPI}/${EP}${ID}" -H "x-okapi-token: ${TOKEN}" -H "x-okapi-module-id: mod-users-17.1.0"
