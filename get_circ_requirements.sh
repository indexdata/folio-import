#! /bin/bash

# Get required data for creating circulation objects (users, items, service-points)

if [ ! $1 ] 
then
	echo "Usage: $0 <save_dir>"
	exit
fi

L='------------------------------------'
DIR=`echo $1 | sed -E 's/\/$//'`

echo $L
node downloadJSONL users $DIR/users.jsonl 
echo $L
node downloadJSONL item-storage/items $DIR/items.jsonl 
echo $L
node downloadJSONL service-points $DIR/service-points.jsonl 