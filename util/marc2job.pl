#!/usr/bin/perl

# This script creates a rawRecordsDto.json payload to be sent to 
# /change-manager/jobExecutions/{id}/records from raw utf8 encoded
# MARC21 record collection.

use JSON;
use Data::Dumper;

$/ = "\x1D";

open RAW, shift or die "Can't find input file!\n";
my $out = { initialRecords => [], recordsMetadata => {} };
$out->{recordsMetadata}->{last} = true;
$out->{recordsMetadata}->{contentType} = "MARC_RAW";
my $c = 0;
while (<RAW>) {
  push $out->{initialRecords}, { record => $_ };
  $c++;
}
$out->{recordsMetadata}->{counter} = $c;
$out->{recordsMetadata}->{total} = $c;

$jout = encode_json($out);
print $jout;
