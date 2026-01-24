#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

EPS='erm/sas?stats=true erm/entitlements?stats=true notes?query=domain==agreements'

for EP in $EPS; do
	URL="${OKAPI}/${EP}"
	C=`curl --http1.1 -w '\n' -s $URL -H "x-okapi-token: ${TOKEN}" | grep -o 'totalRecords": *[0-9]*' | grep -o '[0-9]*'`
	echo "$EP: $C"
done
