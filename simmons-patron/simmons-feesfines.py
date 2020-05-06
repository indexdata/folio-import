"""
Process the Simmons feesfines data export to transform into FOLIO JSON.

   Returns:
       0: Success.
       1: One or more data processing problems encountered.
       2: Configuration issues.

Typical invocation:
python3 simmons-feesfines.py -i data/20200417-feesfines.txt -u uuid-map-ff-users.txt -j uuids.json
"""

import argparse
import csv
import datetime
import json
import logging
import os
import pprint
import re
import sys
import uuid

if sys.version_info[0] < 3:
    raise RuntimeError('Python 3 or above is required.')

LOGLEVELS = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warning": logging.WARNING,
    "error": logging.ERROR,
    "critical": logging.CRITICAL
}

def main():
    parser = argparse.ArgumentParser(
        description="Process the Simmons feesfines data export to transform into FOLIO JSON.")
    parser.add_argument("-i", "--input",
        help="Pathname to input data file (tab-separated values).")
    parser.add_argument("-u", "--map-ff-users",
        default="uuid-map-ff-users.txt",
        help="Pathname to input uuid-ff-users map file (comma-separated values barcode,uuid). (Default: %(default)s)")
    parser.add_argument("-j", "--map-uuids",
        default="uuids.json",
        help="Pathname to UUIDs map JSON file. (Default: %(default)s)")
    parser.add_argument("-o", "--output-accounts",
        default="feesfines-accounts.json",
        help="Pathname to data output-accounts file (JSON). (Default: %(default)s)")
    parser.add_argument("-p", "--output-actions",
        default="feesfines-actions.json",
        help="Pathname to data output-actions file (JSON). (Default: %(default)s)")
    parser.add_argument("-e", "--errors",
        default="errors-feesfines.json",
        help="Pathname to processing errors output file (JSON). (Default: %(default)s)")
    parser.add_argument("-s", "--summary",
        default="summary-feesfines.json",
        help="Pathname to processing summary output file (JSON). (Default: %(default)s)")
    parser.add_argument("-l", "--loglevel",
        choices=["debug", "info", "warning", "error", "critical"],
        default="warning",
        help="Logging level. (Default: %(default)s)")
    args = parser.parse_args()
    loglevel = LOGLEVELS.get(args.loglevel.lower(), logging.NOTSET)
    logging.basicConfig(format="%(levelname)s: %(name)s: %(message)s", level=loglevel)
    logger = logging.getLogger("simmons-feesfines")
    # Process and validate the input parameters
    exit_code = 0
    if args.input:
        if args.input.startswith("~"):
            input_pn = os.path.expanduser(args.input)
        else:
            input_pn = args.input
        if not os.path.exists(input_pn):
            logger.critical("Specified input data file not found: %s", input_pn)
            return 2
    else:
        logger.critical("Input file '--input' not specified")
        return 2
    if args.map_ff_users:
        if args.map_ff_users.startswith("~"):
            input_map_ff_users_pn = os.path.expanduser(args.map_ff_users)
        else:
            input_map_ff_users_pn = args.map_ff_users
        if not os.path.exists(input_map_ff_users_pn):
            logger.critical("Specified input uuid-ff-users map file not found: %s", input_map_ff_users_pn)
            return 2
    if args.map_uuids.startswith("~"):
        map_uuids_pn = os.path.expanduser(args.map_uuids)
    else:
        map_uuids_pn = args.map_uuids
    if not os.path.exists(map_uuids_pn):
        logger.critical("Specified UUIDs map file not found: %s", map_uuids_pn)
        return 2
    else:
        with open(map_uuids_pn) as input_fh:
            try:
                uuids = json.load(input_fh)
            except json.decoder.JSONDecodeError:
                # handle a potentially empty fresh file
                uuids = {}
            try:
                uuid_types_map = uuids['feeFineTypes']
            except KeyError:
                uuid_types_map = {}
            try:
                uuid_accounts_map = uuids['accountIds']
            except KeyError:
                uuid_accounts_map = {}
            try:
                uuid_actions_map = uuids['actionIds']
            except KeyError:
                uuid_actions_map = {}
    errors_list = []
    entries_account = []
    entries_action = []
    critical_count = 0
    statuses = {}
    # Configure some regex
    barcode_item_re = re.compile(r'[0-9]+')
    # Load the users UUID map
    uuid_users_map = load_uuid_map(input_map_ff_users_pn)
    # Process the data
    with open(input_pn) as input_fh:
        # Investigate the header
        #print("encoding=", input_fh.encoding)
        reader = csv.reader(input_fh, dialect='excel-tab')
        header_row = next(reader)
        num_fields = len(header_row)
        #print(header_row)
        input_fh.seek(0)
        # Now process the data
        row_num = 1
        total_account_entries = 0
        barcodes_item = []
        barcodes_action = []
        datetime_now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        reader = csv.DictReader(input_fh, dialect='excel-tab')
        for row in reader:
            row_num += 1
            has_critical = False
            data_errors = []
            entry_account = {}
            entry_action = {}
            # barcode_user
            barcode_user = row['RECORD #(PATRON)'].strip()
            if barcode_user == '':
                data_errors.append('barcode_user: missing')
                has_critical = True
            else:
                try:
                    uuid_user = uuid_users_map[barcode_user]
                except KeyError:
                    data_errors.append('uuid_user: missing')
                    has_critical = True
                else:
                    entry_account['userId'] = uuid_user
                    entry_action['userId'] = uuid_user
            # barcode_item and feeFineId
            barcode_item = row['BARCODE(ITEM)'].strip()
            if barcode_item == '':
                data_errors.append('barcode_item: missing')
                has_critical = True
            elif not re.match(barcode_item_re, barcode_item):
                data_errors.append('barcode_item: non-numeric: {}'.format(barcode_item))
                has_critical = True
            elif barcode_item in barcodes_item:
                data_errors.append('barcode_item: duplicate: {}'.format(barcode_item))
                has_critical = True
            else:
                # accountId
                barcodes_item.append(barcode_item)
                try:
                    uuid_item = uuid_accounts_map[barcode_item]
                except KeyError:
                    if args.loglevel == "debug":
                        do_debug(row_num, barcode, 'Generated new UUID for barcode_item accountId: {}'.format(barcode_item))
                    uuid_item = str(uuid.uuid4())
                    uuid_accounts_map[barcode_item] = uuid_item
                entry_account['id'] = uuid_item
                entry_action['accountId'] = uuid_item
                # actionId
                barcodes_action.append(barcode_item)
                try:
                    uuid_action = uuid_actions_map[barcode_item]
                except KeyError:
                    if args.loglevel == "debug":
                        do_debug(row_num, barcode, 'Generated new UUID for barcode_item actionId: {}'.format(barcode_item))
                    uuid_action = str(uuid.uuid4())
                    uuid_actions_map[barcode_item] = uuid_action
                entry_action['id'] = uuid_action
            # feeFineType
            fee_fine_type = row['Status'].strip()
            if fee_fine_type == '':
                fee_fine_type = 'Lost'
            try:
                statuses[fee_fine_type] += 1
            except KeyError:
                statuses[fee_fine_type] = 1
            try:
                uuid_type = uuid_types_map[fee_fine_type]
            except KeyError:
                if args.loglevel == "debug":
                    do_debug(row_num, barcode, 'Generated new UUID for fee_fine_type: {}'.format(fee_fine_type))
                uuid_type = str(uuid.uuid4())
                uuid_types_map[fee_fine_type] = uuid_type
            entry_account['feeFineType'] = fee_fine_type
            entry_account['feeFineId'] = uuid_type
            entry_action['typeAction'] = fee_fine_type
            # amount
            amount_str = row['Amount'].strip().replace('$', '')
            if amount_str == '':
                amount_str = '30'
            try:
                money = float(amount_str)
            except ValueError:
                data_errors.append('amount: non-numeric: {}'.format(amount_str))
                has_critical = True
            else:
                entry_account['amount'] = money
                entry_account['remaining'] = money
                entry_action['amountAction'] = money
                entry_action['balance'] = money
            # Additional universal account properties
            entry_account['feeFineOwner'] = 'Simmons University Library'
            entry_account['ownerId'] = '538b076d-75ae-4fdc-9b55-441234a9b271'
            entry_account['itemId'] = '0'
            entry_account['loanId'] = '0'
            entry_account['materialTypeId'] = '0'
            entry_account['status'] = {}
            entry_account['status']['name'] = 'Open'
            entry_account['paymentStatus'] = {}
            entry_account['paymentStatus']['name'] = 'Outstanding'
            # Now construct the remainder of its feeFineActions entry
            location = row['Location'].strip()
            if location == '':
                data_errors.append('location: missing')
                location = 'Not known'
            title = row['Title '].strip()
            # FIXME: header has trailing space
            if title == '':
                data_errors.append('title: missing')
                title = 'Not known'
            comments = 'STAFF : barcode={} type={} location={} title={}'.format(
                barcode_item, fee_fine_type, location, title
            )
            # Additional universal action properties
            entry_action['createdAt'] = 'Simmons University Library'
            entry_action['source'] = 'Administrator, Simmons'
            entry_action['comments'] = comments
            entry_action['dateAction'] = datetime_now
            entry_action['transactionInformation'] = '-'
            entry_action['notify'] = False
            #-------------------------------
            # Accumulate any errors for this row
            if len(data_errors) > 0:
                errors_entry = { 'rowNum': row_num, 'barcode': barcode_user, 'errors': data_errors }
                if has_critical:
                    errors_entry['hasCritical'] = True
                    critical_count += 1
                else:
                    errors_entry['hasCritical'] = False
                errors_list.append(errors_entry)
            if not has_critical:
                entries_account.append(entry_account)
                entries_action.append(entry_action)
    # Output the data, and the processing summaries.
    summary = {}
    summary['metadata'] = {
      'dateProcessed': datetime.datetime.now(datetime.timezone.utc).isoformat(),
      'numRecords': row_num - 1,
      'numFields': num_fields,
      'numErrorRecords': len(errors_list),
      'numErrorRecordsCritical': critical_count,
      'numValidAccountEntries': len(entries_account),
      'numValidActionEntries': len(entries_action),
      'feeFineTypes': statuses
    }
    logger.info("Writing output files.")
    with open(args.output_accounts, 'w') as output_fh:
        records = {}
        records['accounts'] = entries_account
        records['totalRecords'] = len(entries_account)
        output_fh.write( json.dumps(records, sort_keys=False, indent=2, separators=(',', ': ')) )
        output_fh.write('\n')
    with open(args.output_actions, 'w') as output_fh:
        records = {}
        records['feefineactions'] = entries_action
        records['totalRecords'] = len(entries_action)
        output_fh.write( json.dumps(records, sort_keys=False, indent=2, separators=(',', ': ')) )
        output_fh.write('\n')
    with open(args.summary, 'w') as summary_fh:
        summary_fh.write( json.dumps(summary, sort_keys=False, indent=2, separators=(',', ': ')) )
        summary_fh.write('\n')
    with open(args.errors, 'w') as errors_fh:
        errors_fh.write( json.dumps(errors_list, sort_keys=False, indent=2, separators=(',', ': ')) )
        errors_fh.write('\n')
    with open('uuids.json', 'w') as output_fh:
        records = {}
        records['feeFineTypes'] = uuid_types_map
        records['accountIds'] = uuid_accounts_map
        records['actionIds'] = uuid_actions_map
        output_fh.write( json.dumps(records, sort_keys=True, indent=2, separators=(',', ': ')) )
        output_fh.write('\n')
    # Finalise
    if critical_count > 0:
        exit_code = 1
    logging.shutdown()
    return exit_code

def load_uuid_map(input_pn):
    """
    Load the data file UUIDs map of barcode,uuid from a comma-separated text file.
    """
    with open(input_pn) as input_fh:
        fieldnames = ['barcode', 'uuid']
        reader = csv.DictReader(input_fh, fieldnames=fieldnames)
        uuids = {}
        for row in reader:
            uuids[row['barcode']] = row['uuid']
    return uuids

def do_debug(row, barcode, message):
    """
    Output a debug message.
    """
    logger = logging.getLogger("simmons-feesfines")
    logger.debug('row={} barcode_user={} {}'.format(row, barcode_user, message))

if __name__ == '__main__':
    sys.exit(main())
