#!/bin/bash

# this script will take a binary MARC file and output MARC in json.

if [ -z $1 ]
then
  echo 'Usage: ./marc2json.sh <raw_marc_file>'
  exit
fi

OUT=$(echo $1 | sed -E 's/\.(mrc|marc|out|data)$//')
OUT="$OUT.jsonl";
yaz-marcdump -f marc8 -t utf8 -l 9=97 -o json $1 | jq . -c > $OUT