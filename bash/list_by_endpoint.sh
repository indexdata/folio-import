#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

EP=$1

if [ -z $EP ]
then
  echo "Usage: ${0} <okapi_endpoint>"
  exit
fi

curl --http1.1 -w '\n' "${OKAPI}/${EP}" -H "x-okapi-token: ${TOKEN}"
