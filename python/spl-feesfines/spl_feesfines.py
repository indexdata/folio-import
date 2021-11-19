"""
Process the Spokane feesfines data export to transform into FOLIO JSON.

   Returns:
       0: Success.
       1: One or more data processing problems encountered.
       2: Configuration issues.

Typical invocation:
python3 spl_feesfines.py \
  -u users-map.tsv -m items.json -v verbs-map.tsv \
  -c locations.json -y material-types.json -p service-points.json \
  -i hz-ledger.json -l debug
"""

import argparse
import csv
import datetime
import json
import logging
import os
from pathlib import Path
import pprint
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
        description="Process the Spokane feesfines data export to transform into FOLIO JSON.")
    parser.add_argument("-i", "--input",
        required=True,
        help="Pathname to input data file (JSON).")
    parser.add_argument("-u", "--map-users",
        required=True,
        help="Pathname to UUID map of users externalSystemId (TSV).")
    parser.add_argument("-m", "--map-items",
        required=True,
        help="Pathname to items data (JSON).")
    parser.add_argument("-v", "--map-verbs",
        required=True,
        help="Pathname to map of blocks to API verbs (TSV).")
    parser.add_argument("-c", "--map-locations",
        required=True,
        help="Pathname to reference data locations (JSON).")
    parser.add_argument("-y", "--map-materialtypes",
        required=True,
        help="Pathname to reference data material-types (JSON).")
    parser.add_argument("-p", "--map-servicepoints",
        required=True,
        help="Pathname to reference data service-points (JSON).")
    parser.add_argument("-f", "--map-ff",
        default="uuids-ff.json",
        help="Pathname to UUID map of feesfines reference,id (JSON). Will be created on first run. (Default: %(default)s)")
    parser.add_argument("-o", "--output-accounts",
        default="feesfines-accounts.json",
        help="Pathname to data output-accounts file (JSON). (Default: %(default)s)")
    parser.add_argument("-a", "--output-actions",
        default="feesfines-actions.json",
        help="Pathname to data output-actions file (JSON). (Default: %(default)s)")
    parser.add_argument("-j", "--output-adjustments",
        default="feesfines-adjustments.jsonl",
        help="Pathname to data output-transactions file (JSONL). (Default: %(default)s)")
    parser.add_argument("-t", "--output-transactions",
        default="feesfines-transactions.jsonl",
        help="Pathname to data output-transactions file (JSONL). (Default: %(default)s)")
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
    logger = logging.getLogger("spl-feesfines")
    logger.debug('Verifying inputs and loading maps ...')
    exit_code = 0
    if args.input.startswith("~"):
        data_pn = os.path.expanduser(args.input)
    else:
        data_pn = args.input
    if not os.path.exists(data_pn):
        logger.critical("Specified input data file not found: %s", data_pn)
        return 2
    if args.map_items.startswith("~"):
        input_pn = os.path.expanduser(args.map_items)
    else:
        input_pn = args.map_items
    if not os.path.exists(input_pn):
        logger.critical("Specified input map items file not found: %s", input_pn)
        return 2
    with open(input_pn) as input_fh:
        items_json = json.load(input_fh)
    map_items = {}
    for item_entry in items_json['items']:
        item_hrid = item_entry['hrid']
        try:
            map_items[item_hrid]
        except KeyError:
            map_items[item_hrid] = {}
            map_items[item_hrid]['id'] = item_entry['id']
            map_items[item_hrid]['barcode'] = item_entry['barcode']
            map_items[item_hrid]['effectiveLocationId'] = item_entry['effectiveLocationId']
            map_items[item_hrid]['holdingsRecordId'] = item_entry['holdingsRecordId']
            map_items[item_hrid]['materialTypeId'] = item_entry['materialTypeId']
            try:
                map_items[item_hrid]['itemLevelCallNumber'] = item_entry['itemLevelCallNumber']
            except KeyError:
                pass
    items_json.clear()
    if args.map_users.startswith("~"):
        input_pn = os.path.expanduser(args.map_users)
    else:
        input_pn = args.map_users
    if not os.path.exists(input_pn):
        logger.critical("Specified input map users file not found: %s", input_pn)
        return 2
    uuid_map_users = load_map_tsv(input_pn)
    if args.map_verbs.startswith("~"):
        input_pn = os.path.expanduser(args.map_verbs)
    else:
        input_pn = args.map_verbs
    if not os.path.exists(input_pn):
        logger.critical("Specified input map blocks to verbs file not found: %s", input_pn)
        return 2
    map_verbs = load_map_tsv(input_pn)
    if args.map_locations.startswith("~"):
        input_pn = os.path.expanduser(args.map_locations)
    else:
        input_pn = args.map_locations
    if not os.path.exists(input_pn):
        logger.critical("Specified input reference data locations file not found: %s", input_pn)
        return 2
    with open(input_pn) as input_fh:
        loc_json = json.load(input_fh)
    map_locations = {}
    for loc_entry in loc_json['locations']:
        try:
            map_locations[loc_entry['id']]
        except KeyError:
            map_locations[loc_entry['id']] = loc_entry['name']
    loc_json.clear()
    if args.map_materialtypes.startswith("~"):
        input_pn = os.path.expanduser(args.map_materialtypes)
    else:
        input_pn = args.map_materialtypes
    if not os.path.exists(input_pn):
        logger.critical("Specified input reference data material-types file not found: %s", input_pn)
        return 2
    with open(input_pn) as input_fh:
        mt_json = json.load(input_fh)
    map_materialtypes = {}
    for mt_entry in mt_json['mtypes']:
        try:
            map_materialtypes[mt_entry['id']]
        except KeyError:
            map_materialtypes[mt_entry['id']] = mt_entry['name']
    mt_json.clear()
    if args.map_servicepoints.startswith("~"):
        input_pn = os.path.expanduser(args.map_servicepoints)
    else:
        input_pn = args.map_servicepoints
    if not os.path.exists(input_pn):
        logger.critical("Specified input reference data service-points file not found: %s", input_pn)
        return 2
    with open(input_pn) as input_fh:
        sp_json = json.load(input_fh)
    map_servicepoints = {}
    for sp_entry in sp_json['servicepoints']:
        sp_code = sp_entry['code']
        try:
            map_servicepoints[sp_code]
        except KeyError:
            map_servicepoints[sp_code] = {}
            map_servicepoints[sp_code]['id'] = sp_entry['id']
            map_servicepoints[sp_code]['name'] = sp_entry['name']
    sp_json.clear()
    if args.map_ff.startswith("~"):
        uuids = os.path.expanduser(args.map_ff)
    else:
        uuid_map_ff_pn = args.map_ff
    if not os.path.exists(uuid_map_ff_pn):
        logger.debug("Specified UUIDs map feesfines file not found. Will create: %s", uuid_map_ff_pn)
        Path(uuid_map_ff_pn).touch()
    with open(uuid_map_ff_pn) as input_fh:
        try:
            uuids = json.load(input_fh)
        except json.decoder.JSONDecodeError:
            # handle a potentially empty fresh file
            uuids = {}
        try:
            uuid_map_types = uuids['feeFineTypes']
        except KeyError:
            uuid_map_types = {}
        try:
            uuid_map_accounts = uuids['accountIds']
        except KeyError:
            uuid_map_accounts = {}
        try:
            uuid_map_actions = uuids['actionIds']
        except KeyError:
            uuid_map_actions = {}
    errors_list = []
    entries_account = []
    entries_action = []
    entries_adjustment = []
    entries_transaction = []
    critical_count = 0
    statuses = {}
    # Process the data
    logger.debug('Processing data ...')
    with open(data_pn) as data_fh:
        data = json.load(data_fh)
    record_num = 0
    references_account = []
    references_action = []
    datetime_now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    for record in data:
        record_num += 1
        has_critical = False
        data_errors = []
        # borrower
        borrower, errors = get_value(record, 'borrower#')
        if errors:
            data_errors.extend(errors)
            has_critical = True
        else:
            try:
                uuid_user = uuid_map_users[str(borrower)]
            except KeyError:
                data_errors.append('uuid_user: missing: {}'.format(borrower))
                has_critical = True
        # item
        uuid_item = None
        item, errors = get_value(record, 'item#')
        if errors:
            data_errors.extend(errors)
        else:
            if item:
                try:
                    uuid_item = map_items[str(item)]['id']
                except KeyError:
                    data_errors.append('uuid_item: missing: {}'.format(item))
        # date
        serial_date, errors = get_value(record, 'date')
        if errors:
            data_errors.extend(errors)
        action_date_time = serial_date_to_utc_string(serial_date)
        action_date = serial_date_to_utc_string(serial_date, full=False)
        # block
        block, errors = get_value(record, 'block')
        try:
            verb = map_verbs[block]
        except KeyError:
            data_errors.append('verb: missing map for block: {}'.format(block))
            has_critical = True
        # amount
        amount, errors = get_value(record, 'amount')
        if errors:
            data_errors.extend(errors)
            has_critical = True
        else:
            try:
                money = amount / float(100)
            except TypeError:
                data_errors.append('amount: non-numeric: {}'.format(amount))
                has_critical = True
        # service-point
        if record['debt_location'] in ['on', 'os', 'ou', 'mail']:
            service_point = 'ss-service-point'
        elif record['debt_location'] in ['ill']:
            service_point = 'ill-service-point'
        else:
            service_point = record['debt_location']
        try:
            map_servicepoints[service_point]
        except KeyError:
            service_point_circ = service_point + "-circ"
            try:
                map_servicepoints[service_point_circ]
            except KeyError:
                msg = 'service-point map: missing: {}'.format(record['debt_location'])
                data_errors.extend([msg])
                has_critical = True
            else:
                uuid_service_point = map_servicepoints[service_point_circ]['id']
                name_service_point = map_servicepoints[service_point_circ]['name']
        else:
            uuid_service_point = map_servicepoints[service_point]['id']
            name_service_point = map_servicepoints[service_point]['name']
        # reference, ord, accountId, actionId
        # If ord=0 then create an account with its associated action
        # otherwise it is a subsequent transaction
        # Already verified the input data, so we know that reference and ord are reliable
        ord_num, errors = get_value(record, 'ord')
        ord_str = str(ord_num)
        reference, errors = get_value(record, 'reference#')
        reference_str = str(reference)
        # comment
        comment, errors = get_value(record, 'comment')
        msg_comment = 'block={} date={} item={} comment={}'.format(block, action_date, item, comment)
        if not has_critical:
            # accountId
            references_account.append(reference_str)
            try:
                uuid_account = uuid_map_accounts[reference_str]
            except KeyError:
                #if args.loglevel == "debug":
                #    do_debug(record_num, reference_str, 'Generated new UUID for reference accountId: {}'.format(reference_str))
                uuid_account = str(uuid.uuid4())
                uuid_map_accounts[reference_str] = uuid_account
            if ord_num == 0:
                entry_account = {}
                entry_action = {}
                # actionId
                #FIXME: use reference_ord for next dry-run
                references_action.append(reference_str)
                try:
                    uuid_action = uuid_map_actions[reference_str]
                except KeyError:
                    #if args.loglevel == "debug":
                    #    do_debug(record_num, reference_str, 'Generated new UUID for reference actionId: {}'.format(reference_str))
                    uuid_action = str(uuid.uuid4())
                    uuid_map_actions[reference_str] = uuid_action
                entry_account['userId'] = uuid_user
                entry_account['id'] = uuid_account
                if uuid_item:
                    entry_account['itemId'] = uuid_item
                    entry_account['barcode'] = map_items[str(item)]['barcode']
                    entry_account['holdingsRecordId'] = map_items[str(item)]['holdingsRecordId']
                    uuid_material_type = map_items[str(item)]['materialTypeId']
                    entry_account['materialType'] = map_materialtypes[uuid_material_type]
                    entry_account['materialTypeId'] = uuid_material_type
                    uuid_location = map_items[str(item)]['effectiveLocationId']
                    entry_account['location'] = map_locations[uuid_location]
                    try:
                        call_number = map_items[str(item)]['itemLevelCallNumber']
                    except KeyError:
                        pass
                    else:
                        entry_account['callNumber'] = call_number
                    entry_account['title'] = 'item hrid={}'.format(str(item))
                entry_account['amount'] = money
                entry_account['remaining'] = money
                entry_action['userId'] = uuid_user
                entry_action['id'] = uuid_action
                entry_action['accountId'] = uuid_account
                entry_action['amountAction'] = money
                entry_action['balance'] = money
                entry_action['dateAction'] = action_date_time
                entry_action['createdAt'] = name_service_point
                entry_action['source'] = 'Administrator, Spokane'
                entry_action['transactionInformation'] = 'reference={} ord={}'.format(reference_str, ord_num)
                entry_action['comments'] = msg_comment
                # Additional universal action properties
                entry_action['typeAction'] = 'Migrated action'
                entry_action['notify'] = False
                # Additional universal account properties
                entry_account['feeFineOwner'] = 'Circulation'
                entry_account['ownerId'] = 'de97c12e-c23b-4ada-883f-95725927add1'
                entry_account['dateCreated'] = datetime_now
                entry_account['dateUpdated'] = datetime_now
                entry_account['status'] = {}
                entry_account['status']['name'] = 'Open'
                entry_account['paymentStatus'] = {}
                entry_account['paymentStatus']['name'] = 'Outstanding'
                #FIXME: Temporarily map all to one FOLIO feeFineType until receive map from SPL
                entry_account['feeFineType'] = 'Lost item fee'
                entry_account['feeFineId'] = 'cf238f9f-7018-47b7-b815-bb2db798e19f'
                entries_account.append(entry_account)
                entries_action.append(entry_action)
            elif block in ['adjdbt']:
                # This is an adjustment action.
                # We need to query the account and compute the balance before loading it.
                entry_adjustment = {}
                reference_ord = reference_str + '_' + str(ord_num)
                references_action.append(reference_ord)
                try:
                    uuid_action = uuid_map_actions[reference_ord]
                except KeyError:
                    #if args.loglevel == "debug":
                    #    do_debug(record_num, reference_str, 'Generated new UUID for reference actionId: {}'.format(reference_str))
                    uuid_action = str(uuid.uuid4())
                    uuid_map_actions[reference_ord] = uuid_action
                entry_adjustment['userId'] = uuid_user
                entry_adjustment['id'] = uuid_action
                entry_adjustment['accountId'] = uuid_account
                entry_adjustment['amountAction'] = money
                entry_adjustment['balance'] = money
                entry_adjustment['dateAction'] = action_date_time
                entry_adjustment['createdAt'] = name_service_point
                entry_adjustment['source'] = 'Administrator, Spokane'
                entry_adjustment['transactionInformation'] = 'reference={} ord={}'.format(reference_str, ord_num)
                entry_adjustment['comments'] = msg_comment
                # Additional universal action properties
                entry_adjustment['typeAction'] = 'Migrated action'
                entry_adjustment['notify'] = False
                entries_adjustment.append(entry_adjustment)
            else:
                # This is a subsequent transaction.
                entry_transaction = {}
                entry_transaction['verb'] = verb
                entry_transaction['accountId'] = uuid_account
                transaction = {}
                transaction['amount'] = str(abs(money))
                transaction['servicePointId'] = uuid_service_point
                transaction['transactionInfo'] = 'reference={} ord={}'.format(reference_str, ord_num)
                if block == 'adjcr':
                    transaction['paymentMethod'] = 'Correction'
                else:
                    transaction['paymentMethod'] = 'Not known'
                transaction['comments'] = msg_comment
                # Additional universal transaction properties
                transaction['userName'] = 'Administrator, Spokane'
                transaction['notifyPatron'] = False
                entry_transaction['data'] = transaction
                entries_transaction.append(entry_transaction)
        #-------------------------------
        # Accumulate any errors for this record
        if len(data_errors) > 0:
            errors_entry = {
              'recordNum': record_num, 'borrower': borrower,
              'reference': reference_str, 'ord': ord_str,
              'errors': data_errors
            }
            if has_critical:
                errors_entry['hasCritical'] = True
                critical_count += 1
            else:
                errors_entry['hasCritical'] = False
            errors_list.append(errors_entry)

    # Output the data, and the processing summaries.
    summary = {}
    summary['metadata'] = {
      'dateProcessed': datetime.datetime.now(datetime.timezone.utc).isoformat(),
      'numRecords': record_num,
      'numErrorRecords': len(errors_list),
      'numErrorRecordsCritical': critical_count,
      'numValidAccountEntries': len(entries_account),
      'numValidActionEntries': len(entries_action),
      'numValidAdjustmentEntries': len(entries_adjustment),
      'numValidTransactionEntries': len(entries_transaction),
      'feeFineTypes': statuses
    }
    logger.debug("Writing output files.")
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
    with open(args.output_adjustments, 'w') as output_fh:
        for entry in entries_adjustment:
            json.dump(entry, output_fh)
            output_fh.write('\n')
    with open(args.output_transactions, 'w') as output_fh:
        for entry in entries_transaction:
            json.dump(entry, output_fh)
            output_fh.write('\n')
    with open(args.summary, 'w') as summary_fh:
        summary_fh.write( json.dumps(summary, sort_keys=False, indent=2, separators=(',', ': ')) )
        summary_fh.write('\n')
    with open(args.errors, 'w') as errors_fh:
        errors_fh.write( json.dumps(errors_list, sort_keys=False, indent=2, separators=(',', ': ')) )
        errors_fh.write('\n')
    with open(uuid_map_ff_pn, 'w') as output_fh:
        records = {}
        #FIXME: records['feeFineTypes'] = uuid_map_types
        records['accountIds'] = uuid_map_accounts
        records['actionIds'] = uuid_map_actions
        output_fh.write( json.dumps(records, sort_keys=True, indent=2, separators=(',', ': ')) )
        output_fh.write('\n')
    # Finalise
    if critical_count > 0:
        exit_code = 1
    logging.shutdown()
    return exit_code

def get_value(record, key):
    """
    Gets and verifies the value of a key from a record.
    """
    errors = []
    value = ''
    prohibit_null = ['borrower#', 'reference#', 'ord', 'date', 'amount']
    try:
        value = record[key]
    except KeyError:
        msg = '{}: missing'.format(key)
        errors.append(msg)
    else:
        if key in prohibit_null:
            if value is None:
                msg = '{}: null'.format(key)
                errors.append(msg)
            if value == '':
                msg = '{}: empty'.format(key)
                errors.append(msg)
    return value, errors

def load_map_tsv(input_pn):
    """
    Load the data file map tab-separated text file.
    """
    with open(input_pn) as input_fh:
        fieldnames = ['key', 'value']
        reader = csv.DictReader(input_fh, dialect='excel-tab', fieldnames=fieldnames)
        maps = {}
        for row in reader:
            json_packet = {}
            json_packet[row['key']] = row['value']
            maps.update(json_packet)
    return maps

def serial_date_to_utc_string(serial_date, full=True):
    """
    Convert a serial date, being days since UNIX epoch, to FOLIO UTC date string.
    """
    if full:
        new_date = datetime.datetime(1970,1,1,0,0,0, tzinfo=datetime.timezone.utc) + datetime.timedelta(serial_date)
        new_date_str = new_date.isoformat(timespec='milliseconds')
    else:
        new_date = datetime.date(1970,1,1) + datetime.timedelta(serial_date)
        new_date_str = new_date.isoformat()
    return new_date_str

def do_debug(record_num, reference, message):
    """
    Output a debug message.
    """
    logger = logging.getLogger("spl-feesfines")
    logger.debug('recordNum=%s reference=%s %s', record_num, reference, message)

if __name__ == '__main__':
    sys.exit(main())
