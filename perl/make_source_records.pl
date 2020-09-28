#! /usr/bin/perl

# Create Folio source records from raw marc. 

use MARC::Record;
use MARC::Record::MiJ;
use Data::Dumper;
use JSON;
use Data::UUID;

binmode STDOUT, ":utf8";
$| = 1;

if (!$ARGV[1]) {
  die "Usage: ./make_source_records.pl <uuid_map_file> <raw_marc_files>\n";
}
my $ctrl_file = shift;

sub uuid {
  my $ug = Data::UUID->new;
  my $uuid = $ug->create();
  my $uustr = lc($ug->to_string($uuid));
  return $uustr;
}

sub getIds {
  open IDS, $ctrl_file or die "Can't open $ctrl_file\n";
  my $idmap = {};
  while (<IDS>) {
    chomp;
    my ($k, $v) = split(/\|/);
    $idmap->{$k} = $v;
  }
  return $idmap;
}

my $id_map = getIds();

foreach (@ARGV) {
  my $infile = $_ or die "Usage: ./marc_source_records.pl <uuid_map_file> <raw_marc_collection>\n";
  if (! -e $infile) {
    die "Can't find raw Marc file!\n"
  }
  if (! -e $ctrl_file) {
    die "Can't find id to uuid map file\n";
  }

  my $save_path = $infile;
  $save_path =~ s/^(.+)\..+$/$1_srs.json/;

  # open a collection of raw marc records
  my $srs_recs = { records=>[] };
  $/ = "\x1D";
  my $count = 0;
  open RAW, "<:encoding(UTF-8)", $infile;
  while (<RAW>) {
    $count++;
    print "\r$count";
    my $raw = $_;
    my $srs = {};
    my $marc = MARC::Record->new_from_usmarc($raw);
    my $mij = MARC::Record::MiJ->to_mij($marc);
    my $parsed = decode_json($mij);
    my $control_num;
    if ($marc->subfield('907','a')) {
      $control_num = $marc->subfield('907','a');
      $control_num =~ s/^.(b\d{7}).$/$1/; # strip out leading period and check digit
    } else {
     $control_num = $marc->field('001')->{_data} 
    }
    next unless $id_map->{$control_num};
    $srs->{id} = uuid();
    my $nine = {};
    $nine->{'999'} = { subfields=>[ { 'i'=>$id_map->{$control_num} }, { 's'=>$srs->{id} } ] };
    $nine->{'999'}->{'ind1'} = 'f';
    $nine->{'999'}->{'ind2'} = 'f';
    push @{ $parsed->{fields} }, $nine;
    $srs->{snapshotId} = 'TO BE ADDED BY LOADING SCRIPT';
    $srs->{matchedId} = $srs->{id};
    $srs->{recordType} = 'MARC';
    $srs->{generation} = 0;
    $srs->{rawRecord} = { id=>$srs->{id}, content=>$raw };
    $srs->{parsedRecord} = { id=>$srs->{id}, content=>$parsed };
    $srs->{externalIdsHolder} = { instanceId=>$id_map->{$control_num} };
    push @{ $srs_recs->{records} }, $srs;
  }
  $out = JSON->new->pretty->encode($srs_recs);
  open OUT, ">:encoding(UTF-8)", $save_path;
  print OUT $out;
  print "\nDone! SRS records saved to $save_path\n";
}
