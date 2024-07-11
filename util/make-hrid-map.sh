#!/bin/bash

if [ ! $1 ] 
then
    echo "Usage: $0 <instances_jsonl_file>"
    exit
fi

jq '.hrid + "\t" + .id' $1 -r