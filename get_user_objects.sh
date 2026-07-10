#! /bin/bash

# Get all user objects (users, perms/users, request-prefrences, service-point-users)

if [ ! $1 ] 
then
	echo "Usage: $0 <save_dir> [ <query> ]"
	exit
fi

L='------------------------------------'
DIR=`echo $1 | sed -E 's/\/$//'`

U=$DIR/users.jsonl
P=$DIR/perms-users.jsonl
S=$DIR/service-points-users.jsonl
R=$DIR/request-prefs.jsonl
T=$DIR/tmp

F="P S R"

if [ $2 ]
then
	Q="?query=$2&limit=500"
fi

echo $L
node downloadJSONL "users${Q}" $U 
echo $L
node downloadJSONL perms/users $P
echo $L
node downloadJSONL service-points-users $S
echo $L
node downloadJSONL request-preference-storage/request-preference $R

for x in $F; do
	FN="${!x}"
	rm -f $T
	while IFS= read -r line; do
		I=$(echo "$line" | sed -E 's/^.*"id":"([^"]*).*/\1/')
		grep "\"userId\":\"$I" $FN >> $T
	done < "$U"
	mv $T $FN
done

wc $DIR/*.jsonl