#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

EPS='users?limit=0 perms/users?limit=0 request-preference-storage/request-preference?limit=0 notes?&query=domain==users&limit=1'

for EP in $EPS; do
	URL="${OKAPI}/${EP}"
	C=`curl --http1.1 -w '\n' -s $URL -H "x-okapi-token: ${TOKEN}" | grep ' "totalRecords' | grep -o '[0-9]*'`
	echo "$EP: $C"
done
