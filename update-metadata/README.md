# NAME

update-metadata: Update metadata elements in various record types

# SYNOPSIS

Use to update the `metadata` and other date elements at the database
level for various record types in a FOLIO system, in the case of a
migration process that has overwritten dates that need to be
preserved.

Source files should be in JSONL, one object per line.

    update-metadata --tenant mylibrary --db-credentials .mylibrary_creds.json --file instances.jsonl --type inventory_instance

For complete command line options, try `update-metadata --help`.

# DEPENDENCIES

- Please, a relatively modern Perl 5 distribution (5.26+)
- [DBI](https://metacpan.org/pod/DBI) (1.640+) with [DBD::Pg](https://metacpan.org/pod/DBD::Pg) (3.10.5+)
- [JSON](https://metacpan.org/pod/JSON) (4.03+)

# OPTIONS

- **-h|--help**

    Prints a brief help message and exits.

- **-t|--tenant** _tenantId_

    _Required._ The tenant ID in the FOLIO environment

- **--db-credentials** _filename_

    _Required._ Path to a simple database credentials file in JSON. The
    file should look like this:

        {
          "host": "postgres.example.com",
          "port": 5432,
          "username": "folio_user",
          "password": "mysecretpassword",
          "database": "my_database"
        }

- **-f|--file** _filename_

    _Required._ Path to a JSONL file, or fileglob. Note that if using a
    glob expression the argument must be quoted to avoid shell expansion.

- **--type** _record\_type_

    _Required._ The type of FOLIO record to update. Supported record
    types:

    - `inventory_instance`
    - `inventory_holdingsrecord`
    - `inventory_item`
    - `user`
    - `proxy`
    - `account`
    - `loan`
    - `request`

- **--transaction-boundary** _records_

    The number of records per transaction. Defaults to all records in one
    transaction.

- **--no-vacuum**

    If this option is present, the `VACUUM ANALYZE` step of the program
    will be skipped. Not recommended except in development. 

# NOTES

The README.md file is generated using [pod2markdown](https://metacpan.org/pod/pod2markdown).
