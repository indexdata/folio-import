#!/bin/bash

if [ ! $1 ] 
then
    echo "Usage: $0 <raw_marc_file>"
    exit
fi

node --max-old-space-size=4096 marc2inst-msm conf/msm-chas.json $1 > $1.log 2>$1.err.log &
tail -f $1.log
