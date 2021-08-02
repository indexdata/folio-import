#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

IID=$1

if [ -z $IID ]
then
  echo "Usage: ${0} <part of identifierTypeId>"
  exit
fi

curl --http1.1 -w '\n' -s "${OKAPI}/instance-storage/instances?query=identifiers=${IID}" -H "x-okapi-token: ${TOKEN}"
