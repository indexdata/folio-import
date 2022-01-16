#!/bin/bash

function usage {
  echo
  cat << EOF
Usage: $0 <jsonl_file>

Where:
  jsonl_file = JSONL data file.

For some feesfines accounts we did not initially have the related loanId data.
We cannot simply overlay the account, because it may have already received
"adjustments" and "transactions" which would have modified the initial amount balance.

So retrieve the current account object, and append the loanId data.

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
output_pn="/tmp/load_feesfines_loans.json"

if [ ! -d 'log' ]; then
  mkdir 'log'
fi
date_start_utc_compact=$(date -u "+%Y%m%d%H%M")
log_fn="log/feesfines-loans-${date_start_utc_compact}.txt"
echo "Input file: $input_fn" > $log_fn
line_num=0
problem_count=0
while IFS= read -r line; do
  ((line_num++))
  if [[ ! "${line}" =~ '"loanId": ' ]]; then
    continue
  fi
  date_utc=$(date -u "+%Y-%m-%d %H:%M:%S")
  date_utc_folio=$(date -u "+%Y-%m-%dT%H:%M:%S.000+00:00")
  accountId=$(echo $line | jq -r '.id')
  loanId=$(echo $line | jq -r '.loanId')
  endpoint="${OKAPI}/accounts/${accountId}"
  echo >> $log_fn
  echo "Record #${line_num}: $accountId ${date_utc}" >> $log_fn
  status=$(${cmd_curl} -s -S -w "%{http_code}" "${endpoint}" -o $output_pn)
  if [ "$status" != "200" ]; then
    msg=$(cat $output_pn)
    echo "ERROR: #${line_num}: $status: ${msg}" >> $log_fn
    ((problem_count++))
    continue
  else
    account_data=$(cat $output_pn)
    hasLoan=$(jq 'if has("loanId") then .loanId else empty end' ${output_pn})
    if [ "$hasLoan" != "" ]; then
      msg="Account already has loanId: ${hasLoan}"
      echo "SKIP: #${line_num}: $status: ${msg}" >> $log_fn
      continue
    fi
    updated_account_data=$(echo ${account_data} \
      | sed -E -e "s/\"amount\" ?:/\"loanId\": \"${loanId}\", \"amount\":/" \
        -e "s/\"dateUpdated\" ?: [^,]*,/\"dateUpdated\": \"${date_utc_folio}\",/"
    )
  fi
  echo "PUT account loanId=${loanId} ..." >> $log_fn
  status=$(${cmd_curl} -X PUT -s -S -w "%{http_code}" "${endpoint}" -d "${updated_account_data}" -o $output_pn)
  if [ "$status" != "204" ]; then
    msg=$(cat $output_pn)
    echo "ERROR: #${line_num}: $status: ${msg}" >> $log_fn
    ((problem_count++))
    continue
  else
    echo $status >> $log_fn
  fi
done < $input_fn

echo "${problem_count} problems. See $log_fn"
