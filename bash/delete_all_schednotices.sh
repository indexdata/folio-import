#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`
TENANT=`cat ${TMP}/tenant`

read -n 1 -p "Are you sure you want to delete all scheduled-notices for tenant \"${TENANT}?\" (y/n): " YN
echo
if [ $YN == y ]
  then
    echo "Deleting all scheduled notices..."
    curl --http1.1 -w '\n' -X DELETE "${OKAPI}/scheduled-notice-storage/scheduled-notices" -H "x-okapi-token: ${TOKEN}"
  else
    echo "Aborting process..."
fi
