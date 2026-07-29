set markup csv on
set echo off
set feedback off
set termout off

spool csv/item.csv
select * from ITEM --FETCH FIRST 100 ROWS ONLY;
spool off

spool csv/item_barcode.csv
select * from ITEM_BARCODE --FETCH FIRST 100 ROWS ONLY;
spool off

spool csv/bib_item.csv
select * from BIB_ITEM --FETCH FIRST 100 ROWS ONLY;
spool off

spool csv/mfhd_item.csv
select * from MFHD_ITEM --FETCH FIRST 100 ROWS ONLY;
spool off

spool csv/item_note.csv
select * from ITEM_NOTE --FETCH FIRST 100 ROWS ONLY;
spool off

spool csv/item_status.csv
select * from ITEM_STATUS --FETCH FIRST 100 ROWS ONLY;
spool off

spool csv/item_status_type.csv
select * from ITEM_STATUS_TYPE --FETCH FIRST 100 ROWS ONLY;
spool off

spool csv/item_type.csv
select * from ITEM_TYPE --FETCH FIRST 100 ROWS ONLY;
spool off

spool csv/item_type_mapping.csv
select * from ITEM_TYPE_MAPPING --FETCH FIRST 100 ROWS ONLY;
spool off

spool csv/location.csv
select * from LOCATION --FETCH FIRST 100 ROWS ONLY;
spool off

spool csv/mfhd_item.csv
select * from MFHD_ITEM --FETCH FIRST 100 ROWS ONLY;
spool off
