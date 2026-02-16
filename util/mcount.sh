#!/bin/bash

if [ ! $1 ]
then
	echo "usage: mcount.sh <raw_marc_file>"
	exit
fi

tr -cd '\035' < $1 | wc -c
