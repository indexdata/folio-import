#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`
EP=$1
FLD=$2
INFILE=$3
if [ ! $INFILE ] 
  then
    echo "Usage: $0 <endpoint> <field_to_search> <file_of_search_terms>"
    exit;
fi

while IFS= read -r line
do
  curl --http1.1 -w '\n' "${OKAPI}/${EP}?query=${FLD}${line}" -H "x-okapi-token: ${TOKEN}"
done < $INFILE
