#!/bin/bash

function usage {
  echo
  cat << EOF
Usage: $0 <jsonl_file>

Where:
  jsonl_file = JSONL data file.
  Format: feefineaction

Loads the feesfines adjustments to already established accounts.
https://dev.folio.org/reference/api/#mod-feesfines-accounts
The data is generated as an action by python/spl_feesfines.py for example.

Obtain the "remaining" of the account, compute the new "balance",
update the account, and load the feefineaction.

EOF
}

input_fn=$1;
if [ -z $input_fn ]; then
  usage >&2
  exit
fi
if [ ! -f $input_fn ]; then
  echo 'File not found' >&2
  usage >&2
  exit
fi

TMP='./.okapi'
OKAPI=`cat ${TMP}/url`
TOKEN=`cat ${TMP}/token`
cmd_curl="curl --http1.1 -H Content-type:application/json -H X-Okapi-Token:${TOKEN}"
output_pn="/tmp/load_feesfines_adjustments.json"

if [ ! -d 'log' ]; then
  mkdir 'log'
fi
date_start_utc_compact=$(date -u "+%Y%m%d%H%M")
log_fn="log/feesfines-adjustments-${date_start_utc_compact}.txt"
echo "Input file: $input_fn" > $log_fn

line_num=0
problem_count=0
while IFS= read -r line; do
  ((line_num++))
  date_utc=$(date -u "+%Y-%m-%d %H:%M:%S")
  date_utc_folio=$(date -u "+%Y-%m-%dT%H:%M:%S.000+00:00")
  accountId=$(echo $line | jq -r '.accountId')
  amountAction=$(echo $line | jq -r '.amountAction')
  endpoint="${OKAPI}/accounts/${accountId}"
  echo >> $log_fn
  echo "Record #${line_num}: $amountAction $accountId ${date_utc}" >> $log_fn
  status=$(${cmd_curl} -s -S -w "%{http_code}" "${endpoint}" -o $output_pn)
  if [ "$status" != "200" ]; then
    msg=$(cat $output_pn)
    echo "ERROR: #${line_num}: $status: ${msg}" >> $log_fn
    ((problem_count++))
    continue
  else
    account_data=$(cat $output_pn)
    remaining=$(echo ${account_data} | jq -r '.remaining')
    new_balance=$(echo "scale=2; $remaining + $amountAction" | bc)
    updated_account_data=$(echo ${account_data} \
      | sed -E -e "s/\"remaining\" ?: [0-9.]*,/\"remaining\": ${new_balance},/" \
        -e "s/\"dateUpdated\" ?: [^,]*,/\"dateUpdated\": \"${date_utc_folio}\",/"
    )
    updated_action_data=$(echo ${line} \
      | sed -E -e "s/\"balance\" ?: [0-9.]*,/\"balance\": ${new_balance},/"
    )
  fi
  echo "PUT account remaining=${new_balance} (was ${remaining}) ..." >> $log_fn
  status=$(${cmd_curl} -X PUT -s -S -w "%{http_code}" "${endpoint}" -d "${updated_account_data}" -o $output_pn)
  if [ "$status" != "204" ]; then
    msg=$(cat $output_pn)
    echo "ERROR: #${line_num}: $status: ${msg}" >> $log_fn
    ((problem_count++))
    continue
  else
    echo $status >> $log_fn
  fi
  echo "POST action amountAction=${amountAction} ..." >> $log_fn
  endpoint="${OKAPI}/feefineactions"
  status=$(${cmd_curl} -X POST -s -S -w "%{http_code}" "${endpoint}" -d "${updated_action_data}" -o $output_pn)
  if [ "$status" != "201" ]; then
    msg=$(cat $output_pn)
    echo "ERROR: #${line_num}: $status: ${msg}" >> $log_fn
    ((problem_count++))
    continue
  else
    echo $status >> $log_fn
  fi
done < $input_fn

echo "${problem_count} problems. See $log_fn"
