#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`
TENANT=`cat ${TMP}/tenant`

read -n 1 -p "Are you sure you want to delete all holdings for tenant \"${TENANT}?\" (y/n): " YN
echo
if [ $YN == y ]
  then
    echo "Deleting all holdings..."
    curl --http1.1 -w '\n' -X DELETE "${OKAPI}/holdings-storage/holdings" -H "x-okapi-token: ${TOKEN}"  -H "x-okapi-tenant: ${TENANT}"
  else
    echo "Aborting process..."
fi
