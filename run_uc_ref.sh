#!/bin/bash

# This script will load U Chicago's ref data files in the order
# of filenames in a text file.  Each filename must be on its own line.

if [ -z $2 ]
then
	echo "Usage: $0 <ref_data_dir> <file_with_list_of_filenames>"
	exit
fi

while IFS= read -r line
do 
	node loadUcRefData.js "$1$line"
done < $2
