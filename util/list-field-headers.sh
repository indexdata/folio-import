#!/bin/bash

if [ ! $1 ]
then
    echo "Usage: $0 <tab_delimited_file> [ <delimiter> ]"
    exit
fi

D="\t"

if [ $2 ]
then
    D=$2
fi

head -1 $1 | sed -E "s/$D/\n/g" | grep . -n