#! /bin/bash

# This script will delete all inventory objects and attached records (loans, bound-with-parts, etc.)
# You will be prompted before delete SRS since this operation will delete not only bibs but also
# authority records.

if [ ! $1 ] 
then
	echo "Usage: $0 <tenant>"
	exit
fi

L='------------------------------------'
GO=`grep "tenant\": \"$1\"" config.json`

if [ "$GO" ] 
then
	EP=inventory-storage/bound-with-parts
	echo $L
	echo "Deleting from $EP..."
	echo $L

	node deleteByEndpoint $EP
	EP=instance-storage/instance-relationships
	echo $L
	echo "Deleting from $EP..."
	echo $L
	node deleteByEndpoint $EP

	EP=preceding-succeeding-titles
	echo $L
	echo "Deleting from $EP..."
	echo $L
	node deleteByEndpoint $EP

	echo $L
	echo "Deleting all loans..."
	echo $L
	node deleteAllLoans $1

	echo $L
	echo "Deleting all items..."
	echo $L
	node deleteAllItems $1

	echo $L
	echo "Deleting all holdings..."
	echo $L
	node deleteAllHoldings $1

	echo $L
	echo "Deleting all instances..."
	echo $L
	node deleteAllInstances $1

	echo $L
	read -n 1 -p "Do you want to delete all SRS? (y/n): " YN
	if [ $YN == y ]
	then
		echo
		echo "Deleting all source storage snapshots..."
		node deleteSnapshotsAndRecords $1
	fi
	echo
	echo $L

	echo Done!
	echo $L
else 
	echo "ERROR \"$1\" does't match config tenant!"
fi