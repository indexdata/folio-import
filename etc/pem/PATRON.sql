set markup csv on
set echo off
set feedback off
set termout off

spool csv/PATRON_NOTES.csv
select * from PATRON_NOTES;
spool off

spool csv/PATRON.csv
select * from PATRON;
spool off

spool csv/PATRON_ADDRESS.csv
select * from PATRON_ADDRESS;
spool off

spool csv/PATRON_BARCODE.csv
select * from PATRON_BARCODE;
spool off

spool csv/PATRON_BARCODE_STATUS.csv
select * from PATRON_BARCODE_STATUS;
spool off

spool csv/PATRON_GROUP.csv
select * from PATRON_GROUP;
spool off

spool csv/PATRON_GROUP_POLICY.csv
select * from PATRON_GROUP_POLICY;
spool off

spool csv/PATRON_NAME_TYPE.csv
select * from PATRON_NAME_TYPE;
spool off

spool csv/PATRON_PHONE.csv
select * from PATRON_PHONE;
spool off

spool csv/PATRON_STAT_CODE.csv
select * from PATRON_STAT_CODE;
spool off

spool csv/PROXY_PATRON.csv
select * from PROXY_PATRON;
spool off

