#! /usr/bin/perl

# Create Folio source records from raw marc. 

use strict;
use warnings;
use MARC::Record;
use MARC::Record::MiJ;
use Data::Dumper;
use JSON;
use UUID::Tiny ':std';

binmode STDOUT, ":utf8";
$| = 1;

if (!$ARGV[2]) {
  die "Usage: ./make_source_records.pl <type (MARC_BIB | MARC_HOLDING)> <uuid_map_file> <raw_marc_files>\n";
}
my $type = shift;
if ($type !~ /^(MARC_BIB|MARC_HOLDING)$/) { die "$type is not a valid type!"; }
my $ctrl_file = shift;

sub uuid {
  my $text = shift;
  my $uuid = create_uuid_as_string(UUID_V5, $text);
  return $uuid;
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

my $json = JSON->new();
$json->canonical();

my $id_map = getIds();

# create snapshot object;
my @t = localtime();
my $dt = sprintf("%4s-%02d-%02d", $t[5] + 1900, $t[4] + 1, $t[3]);
my $tstring = join '', @t;
my $snap_id = uuid($tstring);
my $snap = {
  jobExecutionId=>$snap_id,
  status=>"COMMITTED",
  processingStartedDate=>"${dt}T00:00:00"
};
my $snap_path = $ARGV[0];
$snap_path =~ s/^(.+)\..+$/$1_snapshot.jsonl/;
print "Saving snapshot object to $snap_path...\n";
open SNOUT, ">$snap_path";
print SNOUT $json->encode($snap) . "\n";
close SNOUT;

foreach (@ARGV) {
  my $infile = $_ or die "Usage: ./marc_source_records.pl <uuid_map_file> <raw_marc_collection>\n";
  if (! -e $infile) {
    die "Can't find raw Marc file!\n"
  }
  if (! -e $ctrl_file) {
    die "Can't find id to uuid map file\n";
  }

  my $save_path = $infile;
  $save_path =~ s/^(.+)\..+$/$1_srs.jsonl/;
  unlink $save_path;

  # open a collection of raw marc records
  $/ = "\x1D";
  my $count = 0;
  open RAW, "<:encoding(UTF-8)", $infile;
  open OUT, ">", $save_path;
  while (<RAW>) {
    my $raw = $_;
    my $srs = {};
    my $marc = MARC::Record->new_from_usmarc($raw);
    my $mij = MARC::Record::MiJ->to_mij($marc);
    my $parsed = decode_json($mij);
    my $control_num;
    if ($marc->subfield('907','a')) {
      $control_num = $marc->subfield('907','a');
      $control_num =~ s/^.(b\d{7}).$/$1/; # strip out leading period and check digit
    } elsif ($marc->field('001')) {
     $control_num = $marc->field('001')->data(); 
    } else {
      next;
    }
    next unless $id_map->{$control_num};
    $srs->{id} = uuid($control_num);
    if ($type eq 'MARC_BIB') {
      my $nine = {};
      $nine->{'999'} = { subfields=>[ { 'i'=>$id_map->{$control_num} }, { 's'=>$srs->{id} } ] };
      $nine->{'999'}->{'ind1'} = 'f';
      $nine->{'999'}->{'ind2'} = 'f';
      push @{ $parsed->{fields} }, $nine;
    }
    $srs->{snapshotId} = $snap_id;
    $srs->{matchedId} = $srs->{id};
    $srs->{recordType} = $type;
    $srs->{generation} = 0;
    $srs->{state} = 'ACTUAL';
    $srs->{rawRecord} = { id=>$srs->{id}, content=>$raw };
    $srs->{parsedRecord} = { id=>$srs->{id}, content=>$parsed };
    if ($type eq 'MARC_BIB') {
      $srs->{externalIdsHolder} = { instanceId=>$id_map->{$control_num}, instanceHrid=>$control_num };
    } else {
      $srs->{externalIdsHolder} = { holdingsId=>$id_map->{$control_num}, holdingsHrid=>$control_num };
    }
    print OUT $json->encode($srs) . "\n";
    $count++;
  }
  print "\nDone! $count SRS records saved to $save_path\n";
}
