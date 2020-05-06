"""
Process the Simmons patron data export to transform into FOLIO users JSON.

   Returns:
       0: Success.
       1: One or more data processing problems encountered.
       2: Configuration issues.

Typical invocation:
python3 simmons-patron.py -i data/20200417.txt -m uuid-map.txt -c 1000
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
        description="Process the Simmons patron data export to transform into FOLIO users JSON.")
    parser.add_argument("-i", "--input",
        help="Pathname to input data file (tab-separated values).")
    parser.add_argument("-m", "--map",
        help="Pathname to input uuid map file (comma-separated values barcode,uuid).")
    parser.add_argument("-c", "--chunk",
        default=0,
        help="Enable output chunks (integer). Number of records. Minimum 1000. (Default: 0, so all)")
    parser.add_argument("-o", "--output",
        default="users.json",
        help="Pathname to data output file (JSON).")
    parser.add_argument("-e", "--errors",
        default="errors.json",
        help="Pathname to processing errors output file (JSON). (Default: %(default)s)")
    parser.add_argument("-s", "--summary",
        default="summary.json",
        help="Pathname to processing summary output file (JSON). (Default: %(default)s)")
    parser.add_argument("-l", "--loglevel",
        choices=["debug", "info", "warning", "error", "critical"],
        default="warning",
        help="Logging level. (Default: %(default)s)")
    args = parser.parse_args()
    loglevel = LOGLEVELS.get(args.loglevel.lower(), logging.NOTSET)
    logging.basicConfig(format="%(levelname)s: %(name)s: %(message)s", level=loglevel)
    logger = logging.getLogger("simmons-patron")
    # Process and validate the input parameters
    exit_code = 0
    if args.input:
        if args.input.startswith("~"):
            input_fn = os.path.expanduser(args.input)
        else:
            input_fn = args.input
        if not os.path.exists(input_fn):
            logger.critical("Specified input data file not found: %s", input_fn)
            return 2
    else:
        logger.critical("Input file '--input' not specified")
        return 2
    if args.map:
        if args.map.startswith("~"):
            input_map_fn = os.path.expanduser(args.map)
        else:
            input_map_fn = args.map
        if not os.path.exists(input_map_fn):
            logger.critical("Specified input uuid map file not found: %s", input_map_fn)
            return 2
    chunk_size = int(args.chunk)
    if chunk_size > 0 and chunk_size < 1000:
        logger.critical("Specified chunk size (%s) is less than minimum 1000", chunk_size)
        return 2
    # Enable simple debug statements from within functions, as attributes in the output JSON data.
    # Then later can extract these via jq.
    global DEBUG
    if args.loglevel == 'debug':
        DEBUG = True
    else:
        DEBUG = False
    errors_list = []
    users = []
    critical_count = 0
    # Configure some regex
    univ_id_re = re.compile(r'[0-9]+')
    patron_name_middle_re = re.compile(r'^(.+)( [A-Za-z]\.?)$')
    telephone_re = re.compile(r'^(\+?[0-9-+ .)(x]+)$')
    telephone_ext_re = re.compile(r'^(\+?[0-9-+ .)(]+ext[0-9]+)$')
    date_re = re.compile(r'^([0-9]{1,2})/([0-9]{1,2})/([0-9]{2,4})$')
    # Obtain city,region,zip - lenient
    address_zip_us_re = re.compile(r'^([A-Za-z- .\']+),? +([A-Z][A-Za-z]),? +([0-9 -]+)$')
    address_zip_us_lax_re = re.compile(r'^(.+) +([A-Z][A-Za-z]),? +([0-9 -]+)$')
    # Obtain campus building,room
    address_campus_re = re.compile(r'^([A-Za-z. ,/]+)\$([0-9A-Z- ]+)$')
    address_campus_room_re = re.compile(r'^([0-9A-Z- ]+)$')
    # If using a map of UUIDs, then load it
    uuid_map = {}
    if args.map:
        uuid_map = load_uuid_map(input_map_fn)
    with open(input_fn) as input_fh:
        # Investigate the header
        #print("encoding=", input_fh.encoding)
        reader = csv.reader(input_fh, dialect='excel-tab')
        header_row = next(reader)
        num_fields = len(header_row)
        #print(header_row)
        input_fh.seek(0)
        # Now process the data
        row_num = 1
        total_records = 0
        patron_groups = {}
        barcodes = []
        univ_ids = []
        datetime_now = datetime.datetime.now(datetime.timezone.utc)
        reader = csv.DictReader(input_fh, dialect='excel-tab')
        for row in reader:
            row_num += 1
            has_critical = False
            data_errors = []
            user = {}
            user_id = ''
            barcode = row['barcode'].strip()
            if barcode == '':
                data_errors.append('barcode: missing')
                has_critical = True
            elif barcode in barcodes:
                data_errors.append('barcode: duplicate')
                has_critical = True
            else:
                barcodes.append(barcode)
                try:
                    user_uuid = uuid_map[barcode]
                except KeyError:
                    if args.loglevel == "debug":
                        do_debug(row_num, barcode, 'Generated new UUID.')
                    user_uuid = str(uuid.uuid4())
            # externalSystemId and username: ensure unique and reliable
            univ_id = row['externalSystemId'].strip()
            if univ_id == '':
                data_errors.append('externalSystemId: missing, using barcode')
                user_id = barcode
            elif not re.match(univ_id_re, univ_id):
                data_errors.append('externalSystemId: non-numeric: {}'.format(univ_id))
                has_critical = True
            elif univ_id in univ_ids:
                data_errors.append('externalSystemId: duplicate')
                has_critical = True
            else:
                user_id = univ_id
                univ_ids.append(univ_id)
            user['username'] = user_id
            user['id'] = user_uuid
            user['externalSystemId'] = user_id
            user['barcode'] = barcode
            user['type'] = 'patron'
            # Determine active
            expiry_date = ''
            (expiry_date_str, date_error) = parse_date(row['expirationDate'], date_re)
            if not date_error:
                expiry_date = datetime.datetime.fromisoformat(expiry_date_str)
                if expiry_date > datetime_now:
                    user['active'] = True
                else:
                    user['active'] = False
            else:
                data_errors.append('expirationDate: cannot parse: {}'.format(row['expirationDate']))
                has_critical = True
            # patron_group:
            # For debug, count the occurrence, and whether missing.
            patron_group_str = row['patronGroup'].strip()
            if patron_group_str == '':
                data_errors.append('patronGroup: missing')
                has_critical = True
            else:
                try:
                    patron_groups[patron_group_str] += 1
                except KeyError:
                    patron_groups[patron_group_str] = 1
            user['patronGroup'] = patron_group_str
            # patron_name:
            user['personal'] = {}
            patron_name = row['PATRN NAME'].strip()
            #do_debug(row_num, barcode, 'PATRN NAME={}'.format(patron_name))
            patron_names = patron_name.split(',')
            if patron_name == '':
                data_errors.append('patron_name: missing')
                has_critical = True
            elif not ',' in patron_name:
                data_errors.append('patron_name: no delimiter: {}'.format(patron_name))
                user['personal']['lastName'] = patron_name
            elif len(patron_names) > 2:
                data_errors.append('patron_name: too many delimiters: {}'.format(patron_name))
                user['personal']['lastName'] = patron_name
            else:
                user['personal']['lastName'] = patron_names[0].strip()
                match = re.search(patron_name_middle_re, patron_names[1])
                if match:
                    user['personal']['firstName'] = match.group(1).strip()
                    user['personal']['middleName'] = match.group(2).strip().replace('.', '')
                else:
                    user['personal']['firstName'] = patron_names[1].strip()
            # email: ensure reliable
            email_address = row['personal.email'].strip()
            if email_address != '' and email_address != 'None':
                # FIXME: Perhaps should use more robust regex
                if '@' not in email_address:
                    msg = 'personal.email: invalid: {}'.format(email_address)
                    data_errors.append(msg)
                else:
                    user['personal']['email'] = email_address
            # telephones:
            telephone_str = tidy_telephone(row['personal.phone'].strip().lower())
            if telephone_str != '':
                (telephone, error) = parse_telephone(telephone_str, telephone_re)
                if not error:
                    user['personal']['phone'] = telephone
                else:
                    data_errors.append('personal.phone: has junk: {}'.format(row['personal.phone'].strip()))
            telephone_str = tidy_telephone(row['personal.mobilePhone'].strip().lower())
            if telephone_str != '':
                (telephone, error) = parse_telephone(telephone_str, telephone_re)
                if not error:
                    user['personal']['mobilePhone'] = telephone
                else:
                    data_errors.append('personal.mobilePhone: has junk: {}'.format(row['personal.mobilePhone'].strip()))
            # addresses:
            addresses = []
            # address1: These should be home address.
            address_data = tidy_address(row['ADDRESS'].strip())
            if address_data != '':
                (address, address_errors) = parse_address_street(address_data, address_zip_us_re, address_zip_us_lax_re)
                if len(address_errors) > 0:
                    for error in address_errors:
                        data_errors.append('address1: {}'.format(error))
                address['primaryAddress'] = True
                address['addressTypeId'] = 'Home'
                addresses.append(address)
            # address2: These should be campus address
            address_data = tidy_address(row['ADDRESS2'].strip())
            if address_data != '':
                # First, attempt to parse as a typical campus address
                # if not, then try as a street address.
                (address, address_errors) = parse_address_campus(address_data, address_campus_re, address_campus_room_re)
                if len(address_errors) > 0:
                    for error in address_errors:
                        data_errors.append('address2: {}'.format(error))
                if not address:
                    (address, address_errors) = parse_address_street(address_data, address_zip_us_re, address_zip_us_lax_re)
                    if len(address_errors) > 0:
                        for error in address_errors:
                            data_errors.append('address2: {}'.format(error))
                if address:
                    address['city'] = 'Boston'
                    address['region'] = 'MA'
                    address['postalCode'] = '02115'
                    address['countryId'] = 'US'
                    address['primaryAddress'] = False
                    address['addressTypeId'] = 'Campus'
                    addresses.append(address)
            user['personal']['addresses'] = addresses
            user['personal']['preferredContactTypeId'] = determine_preferred_contact(user)
            # dates:
            (created_date_str, date_error) = parse_date(row['createdDate'], date_re)
            if not date_error:
                user['createdDate'] = created_date_str
            else:
                data_errors.append('createdDate: cannot parse: {}'.format(row['createdDate']))
            (updated_date_str, date_error) = parse_date(row['updatedDate'], date_re)
            if not date_error:
                user['updatedDate'] = updated_date_str
            else:
                data_errors.append('updatedDate: cannot parse: {}'.format(row['updatedDate']))
            if expiry_date != '':
                user['expirationDate'] = expiry_date_str
            #-------------------------------
            # Record any errors for this row
            if len(data_errors) > 0:
                errors_entry = { 'rowNum': row_num, 'barcode': barcode, 'username': user_id, 'errors': data_errors }
                if has_critical:
                    errors_entry['hasCritical'] = True
                    critical_count += 1
                else:
                    errors_entry['hasCritical'] = False
                errors_list.append(errors_entry)
            if not has_critical:
                total_records += 1
                users.append(user)
    # Output the data, and the processing summaries.
    summary = {}
    summary['metadata'] = {
      'dateProcessed': datetime.datetime.now(datetime.timezone.utc).isoformat(),
      'numRecords': row_num - 1,
      'numFields': num_fields,
      'numErrorRecords': len(errors_list),
      'numErrorRecordsCritical': critical_count,
      'patronGroups': patron_groups
    }
    with open(args.summary, 'w') as summary_fh:
        summary_fh.write( json.dumps(summary, sort_keys=False, indent=2, separators=(',', ': ')) )
        summary_fh.write('\n')
    with open(args.errors, 'w') as errors_fh:
        errors_fh.write( json.dumps(errors_list, sort_keys=False, indent=2, separators=(',', ': ')) )
        errors_fh.write('\n')
    if chunk_size == 0:
        records = {}
        records['users'] = users
        records['totalRecords'] = total_records
        with open(args.output, 'w') as output_fh:
            output_fh.write( json.dumps(records, sort_keys=False, indent=2, separators=(',', ': ')) )
            output_fh.write('\n')
    else:
        num_chunks = int(total_records / chunk_size)
        chunk_size_last = total_records % chunk_size
        if chunk_size_last != 0:
            num_chunks += 1
        else:
            chunk_size_last = chunk_size
        (output_basename, output_extension) = args.output.split('.')
        for i in range(0,num_chunks):
            chunk_num = '%04d' % (i+1)
            output_fn = output_basename + chunk_num + '.' + output_extension
            if i == 0:
                start = 0
                end = chunk_size
                total_recs = chunk_size
            elif i < (num_chunks - 1):
                start = end
                end = start + chunk_size
                total_recs = chunk_size
            else:
                start = end
                end = total_records
                total_recs = chunk_size_last
            #print('output_fn={} start={} end={}'.format(output_fn, start, end))
            users_slice = users[start:end]
            packet = {"users": users_slice, "totalRecords": total_recs}
            with open(output_fn, 'w') as output_fh:
                output_fh.write( json.dumps(packet, sort_keys=False, indent=2, separators=(',', ': ')) )
                output_fh.write('\n')
    # Finalise
    if critical_count > 0:
        exit_code = 1
    logging.shutdown()
    return exit_code

def tidy_telephone(telephone):
    """
    Tidy a telephone number.
    Weed out some obvious bad data.
    """
    junk = ['none', 'none1', 'na', 'n/a', 'same', 'yes', 'cell', 'offsite']
    telephone = telephone.replace('xxx-xxx-xxxx', '')
    telephone = telephone.replace('ext', ' x')
    telephone = telephone.replace(' cell', '')
    telephone = telephone.replace('"', '')
    telephone = telephone.replace('%', '')
    if telephone in junk:
        return ''
    else:
        return telephone

def parse_telephone(telephone, telephone_re):
    """
    Parse a telephone number.
    Returns: telephone, error condition
    """
    match = re.search(telephone_re, telephone)
    if match:
        return (telephone, False)
    else:
        return (telephone, True)

def tidy_address(address):
    """
    Tidy an address.
    Weed out some obvious bad data or not-needed data.
    """
    address = address.lstrip('$,')
    address = address.rstrip('$,')
    address = re.sub(r'\$US$', '', address)
    return address

def parse_address_street(address_str, address_zip_us_re, address_zip_us_lax_re):
    """
    Parse an address.
    Usually has three or two parts, with the final part being 'City, State Zip'
    Some have less parts.
    Some are non-USA (perhaps if no 2-character state and zip).
    Returns: address object, errors list
    """
    address = {}
    errors = []
    parts = address_str.split('$')
    if DEBUG:
        address['debug_address_str'] = address_str
        address['debug_part_1'] = parts[0]
        address['debug_part_last'] = parts[-1]
        address['debug_length'] = len(parts)
        #if len(parts) == 1:
            #print('cannot split: {}: {}'.format(debug_type, address_str))
    match = re.search(address_zip_us_re, parts[-1])
    if match:
        if DEBUG:
            address['debug_parser'] = 'A'
        address['city'] = match.group(1)
        address['region'] = match.group(2).upper()
        address['postalCode'] = match.group(3)
        address['countryId'] = 'US'
        if len(parts) == 2:
            if DEBUG:
                address['debug_parser'] = 'B'
            address['addressLine1'] = parts[0]
        else:
            if len(parts) == 3:
                if DEBUG:
                    address['debug_parser'] = 'C'
                address['addressLine1'] = parts[0]
                if parts[0] != parts[1]:
                    if DEBUG:
                        address['debug_parser'] = 'D'
                    address['addressLine2'] = parts[1]
    else:
        match2 = re.search(address_zip_us_lax_re, address_str)
        if match2:
            if DEBUG:
                address['debug_parser'] = 'E'
            address['region'] = match2.group(2).upper()
            address['postalCode'] = match2.group(3)
            address['countryId'] = 'US'
            # FIXME: Cannot reliably parse the remainder for city and street address
            errors.append('Partial parse street address: {}'.format(address_str))
            address['addressLine1'] = match2.group(1)
        else:
            # This is the remainder that we could not parse.
            # So just put it all into "addressLine1" to be manually adjusted later.
            if DEBUG:
                address['debug_parser'] = 'F'
            errors.append('Cannot parse street address: {}'.format(address_str))
            address['addressLine1'] = address_str
    return (address, errors)

def parse_address_campus(address_str, address_campus_re, address_campus_room_re):
    """
    Parse an address. Type 2 = Campus.
    First look for "room" on its own,
    then for delimited "building,room".
    Returns: address object, errors list
    """
    address = {}
    errors = []
    if '$' not in address_str:
        match = re.search(address_campus_room_re, address_str)
        if match:
            address['addressLine1'] = match.group(1)
        else:
            # This leftover is either an erroneous email address or a building name
            if '@' in address_str:
                errors.append('Campus address seems to be email: {}'.format(address_str))
                #FIXME: Should this be saved to addressLine1 anyway.
            else:
                # It seems to be a building address
                address['addressLine2'] = address_str
    else:
        match = re.search(address_campus_re, address_str)
        if match:
            address['addressLine2'] = match.group(1)
            address['addressLine1'] = match.group(2)
        #else:
            # FIXME: here just for debug
            #errors.append('Cannot parse campus address: {}'.format(address_str))
    return (address, errors)

def parse_date(date_str, date_re):
    """
    Parse a date and convert to UTC date string.
    Format: MM/DD/YYYY
    Handle some that might be Y2K.
    Returns: UTC datetime, error condition
    """
    date_str_tidy = date_str.replace('-', '')
    date_str_tidy = date_str_tidy.replace(' ', '')
    match = re.search(date_re, date_str_tidy)
    if match:
        year = match.group(3)
        if len(year) == 2:
            year = '19' + year
        try:
            date_utc = datetime.datetime(
                int(year), int(match.group(1)), int(match.group(2)),
                0, 0, tzinfo=datetime.timezone.utc).isoformat()
        except:
            return (date_str, True)
        else:
            return (date_utc, False)
    else:
        return (date_str, True)

def determine_preferred_contact(user_data):
    """
    Determine the preferredContactTypeId
    Use "email" if it does exist, else "mail" even if address/phone does not exist.
    """
    try:
        user_data['personal']['email']
    except KeyError:
        preferred_contact = 'mail'
    else:
        preferred_contact = 'email'
    return preferred_contact

def load_uuid_map(input_fn):
    """
    Load the data file map of barcode,uuid
    Enables reloading of users data.
    """
    with open(input_fn) as input_fh:
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
    logger = logging.getLogger("simmons-patron")
    logger.debug('row={} barcode={} {}'.format(row, barcode, message))

if __name__ == '__main__':
    sys.exit(main())
