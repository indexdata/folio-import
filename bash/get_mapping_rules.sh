#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`

TYPE=$1
if [ ! $TYPE ] 
then
	echo "Usage: $0 <type: marc-bib, marc-holdings, marc-authority>"
	exit
fi

curl --http1.1 -w '\n' "${OKAPI}/mapping-rules/$TYPE" -H "x-okapi-token: ${TOKEN}"
