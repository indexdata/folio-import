#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

curl --http1.1 -w '\n' "${OKAPI}/perms/permissions?length=10000&query=(mutable==true)&expandSubs=false" -H "x-okapi-token: ${TOKEN}"
