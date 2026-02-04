#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token | sed 's/.$//'`

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

URL="${OKAPI}/${EP}${ID}"

curl --http1.1 -w '\n' -s $URL -H "cookie: ${TOKEN}"
