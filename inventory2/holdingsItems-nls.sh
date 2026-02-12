#!/usr/bin/env bash
if [ ! $1 ] 
then
    echo "Usage: $0 <bib_map>"
    exit
fi
node --max-old-space-size=4096 holdingsItems-nls conf/nls-dev.json $1