#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`
TEN=`cat ${TMP}/tenant`
REFDIR=$1
if [ ! $1 ]
  then
    echo "Usage: ${0} <reference_data_directory>"
    exit
fi

if [ ! -d $REFDIR ]
  then
    mkdir $REFDIR
fi

echo "Getting mod-users version..."
MODS=`curl --http1.1 -w "\n" "${OKAPI}/_/proxy/tenants/${TEN}/modules" -H "x-okapi-token: ${TOKEN}"`
MODUSERS=`echo $MODS | grep -o 'mod-users-[^b][^"]*'`

EPS='groups addresstypes departments custom-fields note-types service-points'

for EP in $EPS
do
    echo "Fetching ${EP}"
    MHEAD='accept: application/json'
    if [ $EP == custom-fields ]; then
	MHEAD="x-okapi-module-id: ${MODUSERS}"
    fi
    curl --http1.1 -o "${REFDIR}/${EP}.json" -w "\n" "${OKAPI}/${EP}?limit=1000" -H "x-okapi-token: ${TOKEN}" -H "${MHEAD}"
done
