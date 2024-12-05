#!/bin/bash

grep okapi.: config.json
grep tenant.: config.json
grep logpath.: config.json || echo "  (logpath not set)"

while true; do
    read -n 1 -p "Change config? (y/n) " change
    echo
    case $change in
        [Yy]* ) break;;
        [Nn]* ) echo "Config not changed."; exit;;
        * ) echo "Answer y or n.";;
    esac
done

options=$(ls configs/json)
select opt in $options
do
	cp configs/json/$opt config.json
	break
done

echo "Config set to:"
grep okapi.: config.json
grep tenant.: config.json
grep logpath.: config.json || echo "  (logpath not set)"
