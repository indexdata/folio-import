#! /bin/bash

# Get required data for creating circulation objects (users, items, service-points)

if [ ! $1 ] 
then
	echo "Usage: $0 <save_dir> [ <no_items> ]"
	exit
fi

L='------------------------------------'
DIR=`echo $1 | sed -E 's/\/$//'`

echo $L
node downloadJSONL users $DIR/users.jsonl 
if [ ! $2 ]
then
	echo $L
	node downloadJSONL item-storage/items $DIR/items.jsonl 
fi
echo $L
node downloadJSONL service-points $DIR/service-points.jsonl 
echo $L
node downloadJSONL feefines $DIR/feefines.jsonl
