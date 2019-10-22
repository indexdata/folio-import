#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`
UN=$1
if [ ! $UN ] 
  then
    echo "Usage: $0 <username>"
    exit;
fi

curl --http1.1 -w '\n' "${OKAPI}/users?query=username==$UN" -H "x-okapi-token: ${TOKEN}"
