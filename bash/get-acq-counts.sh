#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token | sed 's/.$//'`

EPS='organizations-storage/organizations organizations-storage/contacts organizations-storage/interfaces'

for EP in $EPS; do
	URL="${OKAPI}/${EP}?limit=0"
	C=`curl --http1.1 -w '\n' -s $URL -H "x-okapi-token: ${TOKEN}" | grep ' "totalRecords' | grep -o '[0-9]*'`
	echo "$EP: $C"
done
