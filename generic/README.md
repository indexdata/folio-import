# Generic FOLIO objects


## `generic-inventory.tar.gz` 

1) bibs-instances.jsonl -- 3000 instances of various types (text, performed music, notated music, images, serials, etc.)
2) bibs-holdings.jsonl -- 3000 dummy holdings with the location "Annex" or "Main Library", call number from MARC 050
3) bibs-items.jsonl -- 3000 dummy items with material type "unspecified" and loan type of "Can circulate"
4) bibs-snapshot.jsonl -- 1 source storage snapshot object
5) bibs-srs.jsonl -- 3000 source records linked to the 3000 instances
6) bibs-presuc.jsonl -- 388 preceeding/succeeding titles

Use the loadInventory.js script to load all of the above files.
