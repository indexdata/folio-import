#!/bin/bash

udir=/data/sftpusers/holycross/users
wdir=/home/jobber/holycross

if [ -a $udir/*.txt ]
then
	ts=`date -I`
	ddir=$udir/Done/$ts
	mkdir -p $ddir
	cat $udir/*.txt > $udir/users.csv
	cd $wdir

	node hcUsersOngoing.js $udir/users.csv

	./login-holycross.sh
	./load_users.sh $udir/mod*json

	mv $udir/*.txt $ddir
	mv $udir/*.csv $ddir
	mv $udir/*.json $ddir
fi
