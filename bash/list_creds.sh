#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

if [ $1 ]
  then
    Q="?${1}";
fi

curl --http1.1 -w '\n' "${OKAPI}/authn/credentials${Q}" -H "x-okapi-token: ${TOKEN}"
