#!/bin/bash

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`
ID=$1
if [ ! $ID ] 
  then
    echo "Usage: $0 <loan_policy_id>"
    exit;
fi

curl --http1.1 -w '\n' "${OKAPI}/loan-policy-storage/loan-policies/${ID}" -H "x-okapi-token: ${TOKEN}"
