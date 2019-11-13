#! /usr/bin/perl

# Create Folio source records from raw marc. 

use MARC::Record;
use MARC::Record::MiJ;
use Data::Dumper;
use JSON;
use Data::UUID;

binmode STDOUT, ":utf8";
$| = 1;

my $ctrl_file = shift;
my $infile = shift or die "Usage: ./marc_source_records.pl <uuid_map_file> <raw_marc_collection>\n";
if (! -e $infile) {
  die "Can't find raw Marc file!\n"
}
if (! -e $ctrl_file) {
  die "Can't find id to uuid map file\n";
}

sub uuid {
  my $ug = Data::UUID->new;
  my $uuid = $ug->create();
  my $uustr = lc($ug->to_string($uuid));
  return $uustr;
}

sub getIds {
  local $/ = '';
  open IDS, $ctrl_file or die "Can't open $ctrl_file\n";
  my $jsonstr = <IDS>;
  my $json = decode_json($jsonstr);
  return $json;
}

my $id_map = getIds();

# open a collection of raw marc records
my $srs_recs = { records=>[] };
$/ = "\x1D";
open RAW, "<:encoding(UTF-8)", $infile;
while (<RAW>) {
  my $raw = $_;
  my $srs = {};
  my $marc = MARC::Record->new_from_usmarc($raw);
  my $parsed = MARC::Record::MiJ->to_mij($marc);
  my $control_num = $marc->field('001')->{_data};
  $srs->{id} = uuid();
  $srs->{rawRecord} = { id=>uuid(), content=>$raw };
  $srs->{parsedRecord} = { id=>uuid(), content=>decode_json($parsed) };
  push $srs_recs->{records}, $srs;
}
$out = JSON->new->pretty->encode($srs_recs);
print $out;
