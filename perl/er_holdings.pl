#! /usr/bin/perl

# Create Folio holdings and electronic resource Marc Records.

use MARC::Record;
use Data::Dumper;
use JSON;
use Data::UUID;

binmode STDOUT, ":utf8";

my $mapfile = shift;

my $infile = shift or die "Usage: er_holdings.pl <instance_map> <raw_marc_file>\n";
if (! -e $infile) {
  die "Can't find input file!\n"
}
my $filename = $infile;
$filename =~ s/^(.+\/)?(.+)\..+$/$2/;
my $batch_path = $1;

my $namespace = $ENV{UUID_NS} || '0000000-0000-0000-0000-0000000000';
sub uuid {
  my $name = shift;
  my $ug = Data::UUID->new;
  my $uuid = $ug->create();
  my $uustr = lc $ug->create_from_name_str($namespace, $name);
  return $uustr;
}

open INST, $mapfile or die "Can't find map file!";
my $inst_map = {};
while (<INST>) {
  chomp;
  my ($k, $v) = split(/\|/);
  $inst_map->{$k} = $v;
}

# set static callno type to LC
my $cn_type_id = '95467209-6d7b-468b-94df-0f5d7ad2747d';

my $holdings_type_id = '996f93e2-5b5e-4cf2-9168-33ced1f95eed';
my $location_id = 'b681f0f3-c5d3-434f-8c15-db3d8b074c43';
my $relationship_id = 'f5d0068e-6272-458e-8a81-b85e7b9a14aa';
my $perm_loantype_id = '2b94c631-fca9-4892-a730-03ee529ffe27';
my $material_type_id = 'dd0bf600-dbd9-44ab-9ff2-e2a61a6539f1';


# open a collection of raw marc records
$/ = "\x1D";
open RAW, "<:encoding(UTF-8)", $infile;
my $hcoll = { holdingsRecords => [] };
my $icoll = { items => [] };
my $hcount = 0;
my $mcount = 0;
my $icount = 0;
while (<RAW>) {
  my $hrec = {};
  $raw = $_;
  my $marc = MARC::Record->new_from_usmarc($raw);
  my $control_num = $marc->field('001')->as_string();
  next if !$inst_map->{$control_num};
  $hrec->{hrid} = "ho-$control_num";
  my $uustr = uuid($hrec->{hrid});
  $hrec->{holdingsTypeId} = $holdings_type_id;
  $hrec->{id} = $uustr;
  $hrec->{instanceId} = $inst_map->{$control_num};
  my @callnums = $marc->field('050') || null;
  my $cn = $callnums[0]->as_string('a') || $callnums[0]->as_string('b') if $callnums[0];
  $hrec->{callNumber} = $cn;
  $hrec->{callNumberTypeId} = $cn_type_id;
  $hrec->{permanentLocationId} = $location_id;
  my @url_fields = $marc->field('856');
  foreach (@url_fields) {
    my $uri = $_->as_string('u');
    next unless $uri;
    if (!$hrec->{electronicAccess}) {
      $hrec->{electronicAccess} = []; 
    } 
    my $eaObj = {};
    $eaObj->{uri} = $uri;
    my $lt = $_->as_string('y');
    $eaObj->{linkText} = $lt if $lt;
    $eaObj->{relationshipId} = $relationship_id;
    push $hrec->{electronicAccess}, $eaObj;
  }
  $hcount++;
  push @{ $hcoll->{holdingsRecords} }, $hrec;
  
  # create item
  my $item = {};
  my $ihrid = "it-$control_num";
  $item->{id} = uuid($ihrid);
  $item->{hrid} = $ihrid;
  $item->{status}->{name} = 'Available';
  $item->{permanentLoanTypeId} = $perm_loantype_id;
  $item->{materialTypeId} = $material_type_id;
  $item->{holdingsRecordId} = $uustr;

  push @{ $icoll->{items} }, $item;
  $icount++;

  $mcount++;
  print "# $mcount [$control_num]\n";
}

$hcoll->{totalRecords} = $hcount;
my $hcollection = JSON->new->pretty->encode($hcoll);
my $holdings_file = "$batch_path/${filename}_holdings.json";
open HLD, ">:encoding(UTF-8)", $holdings_file;
print HLD $hcollection;
print $hcollection;
close HLD;

$icoll->{totalRecords} = $icount;
my $icollection = JSON->new->pretty->encode($icoll);
my $items_file = "$batch_path/${filename}_items.json";
open ITM, ">:encoding(UTF-8)", $items_file;
print ITM $icollection;
print $icollection;
close ITM;

print "\nHoldings: $hcount";