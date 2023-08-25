#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`
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

EPS='acquisitions-units/units locations material-types batch-group-storage/batch-groups orders/acquisition-methods finance/expense-classes'

for EP in $EPS
do
    FN=`echo $EP | sed 's/.*\///'`;
    echo "Fetching ${EP}"
    curl --http1.1 -o "${REFDIR}/${FN}.json" -w "\n" "${OKAPI}/${EP}?limit=1000" -H "x-okapi-token: ${TOKEN}"
done

echo "Fetching configurations/entries?query=configName=tenant.addresses"
curl --http1.1 -o "${REFDIR}/addresses.json" -w "\n" "${OKAPI}/configurations/entries?query=configName=tenant.addresses" -H "x-okapi-token: ${TOKEN}"

