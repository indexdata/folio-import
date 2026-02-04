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

EPS='owners feefines'

for EP in $EPS
do
    FN=`echo $EP | sed 's/.*\///'`;
    echo "Fetching ${EP}"
    curl --http1.1 -o "${REFDIR}/${FN}.json" -w "\n" "${OKAPI}/${EP}?limit=1000" -H "x-okapi-token: ${TOKEN}"
done
