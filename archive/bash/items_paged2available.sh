#! /bin/bash

# This script finds items with "Paged" status and creates JSONL item objects with
# status set to "Available". Use this script to undo status changes from requests
# loads.  

./list_by_endpoint.sh 'item-storage/items?query=status.name==paged&limit=1000' | \
jq -c '.items[] | .status.name="Available"'
