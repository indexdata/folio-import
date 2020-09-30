#! /usr/bin/perl

# Create Folio holdings and items from Spokane Sirsi Marc Records.
# Holdings are created by unique location and call number.
# Item data is in the 949 field.

use strict;
use warnings;
use MARC::Record;
use Data::Dumper;
use JSON;
use Data::UUID;

binmode STDOUT, ":utf8";

my $limit = 1000000;

unless ($ARGV[1]) {
  die "Usage: items_spl.pl <ref_data_path> <raw_marc_file>\n"
}

my $refpath = shift;
if (! -e $refpath) {
  die "Can't find ref data directory!\n"
}
my $infile = shift;
if (! -e $infile) {
  die "Can't find input file!\n"
}

my $namespace = $ENV{UUID_NS} || '0000000-0000-0000-0000-0000000000';
sub uuid {
  my $name = shift;
  my $ug = Data::UUID->new;
  my $uuid = $ug->create();
  my $uustr = lc $ug->create_from_name_str($namespace, $name);
  return $uustr;
}

my $filename = $infile;
$filename =~ s/^(.+\/)?(.+)\..+$/$2/;
my $batch_path = $1;

sub get_ref_data {
  my $path = shift;
  my $prop = shift;
  local $/ = '';
  open REF, "<:encoding(UTF-8)", "$refpath/$path" or die "Can't find reference file: $path\n";
  my $ref_str = <REF>;
  my $ref_json = decode_json($ref_str);
  my $ret = {};
  foreach (@{ $ref_json->{$prop} }) {
    if ($prop eq 'locations') {
      $ret->{$_->{code}} = $_->{id};
    } else {
      $ret->{$_->{name}} = $_->{id};
    }
  }
  close REF;
  return $ret;
}

# load folio reference data 
my $folio_locs = get_ref_data('locations.json', 'locations');
my $folio_mtypes = get_ref_data('material-types.json', 'mtypes');
my $folio_rel = get_ref_data('electronic-access-relationships.json', 'electronicAccessRelationships');
my $folio_notes = get_ref_data('item-note-types.json', 'itemNoteTypes');

#open collections.tsv map
my $coll_map = {};
open COLL, "$refpath/collections.tsv" or die "Can't open collections.tsv file";
while (<COLL>) {
  chomp;
  my ($k, $v, $o) = split(/\t/);
  $coll_map->{$k} = $v;
}

# load bib id to instance id map
my $inst_map_file = $infile;
$inst_map_file =~ s/\.(mrc|marc)$/_instances.map/;
my $inst_map = {};
open INST, "$inst_map_file" or die "Can't find instance id file: $inst_map_file\n";
while (<INST>) {
  chomp;
  my ($k, $v) = split(/\|/);
  $inst_map->{$k} = $v;
}
close INST;

# set relationship indicator map
my $rel_ind = {
  '0' => 'Resource',
  '1' => 'Version of resource',
  '2' => 'Related resource',
  '8' => 'No display constant generated',
  ' ' => 'No information provided'
};

# set status map
my $status_map = {
  '-' => 'Available',
  'm' => 'Missing',
  't' => 'In transit',
  'i' => "In process",
  'c' => "In process",
  '!' => "Awaiting pickup",
  'o' => 'Available',
  'h' => 'Available',
};

# iii item note codes
my $item_notes = {
  'p' => 'Provenance',
  'g' => 'Provenance',
  'f' => 'Binding',
  'o' => 'Note',
  'c' => 'MilleniumData',
  's' => 'MilleniumData',
  '-' => 'Note'
};

my $status_note = {};

# set static callno type to LC
my $cn_type_id = '95467209-6d7b-468b-94df-0f5d7ad2747d';

# set static loantype to "can circulate"
my $loan_type_id = '2b94c631-fca9-4892-a730-03ee529ffe27';

# simmons administrator id
my $admin = '7a816507-d31a-54af-8af4-d9fe3eb48324';
my $admin_first = 'Script';
my $admin_last = 'Perl';

# open a collection of raw marc records
$/ = "\x1D";
open RAW, "<:encoding(UTF-8)", $infile;
my $item_seen = {};
my $hcoll = { holdingsRecords => [] };
my $icoll = { items => [] };
my $hcount = 0;
my $icount = 0;
my $mcount = 0;
while (<RAW>) {
  my $hrec_num = 0;
  my $hrecs = {};
  my $raw = $_;
  my $marc = MARC::Record->new_from_usmarc($raw);
  my $control_num; 
  if ($marc->field('001')) {
    $control_num = $marc->field('001')->as_string();
  } else {
    next;
  }
  next if !$inst_map->{$control_num};
  my @marc_items = $marc->field('949');
  foreach (@marc_items) {
    my $callno = $_->as_string('e');
    my $loc_code = $_->as_string('g');
    if (!$loc_code) {
      print "WARN No location code-- skipping...\n";
      next;
    }
    $loc_code = lc $loc_code;
    my $loc_key = "$loc_code-$callno";
    $loc_code =~ s/^\s+|\s+$//g;

    # create holdings record if record doesn't already exists for said location
    if (!$hrecs->{$loc_key}) {
      $hrec_num++;
      my $hrid = "$control_num-$hrec_num";
      $hrecs->{$loc_key}->{hrid} = $hrid;
      my $uustr = uuid($hrid);
      $hrecs->{$loc_key}->{id} = $uustr;
      $hrecs->{$loc_key}->{instanceId} = $inst_map->{$control_num};
      # print HIDS $inst_map->{$iii_num} . "|" . $uustr . "\n";
      $hrecs->{$loc_key}->{callNumber} = $callno;
      $hrecs->{$loc_key}->{callNumberTypeId} = $cn_type_id;
      # my $loc_name = $locmap->{$loc_code};
      $hrecs->{$loc_key}->{permanentLocationId} = $folio_locs->{$loc_code} or die "[$control_num] Can't find permanentLocationId for $loc_code";
      my @url_fields = $marc->field('856');
      foreach (@url_fields) {
        my $uri = $_->as_string('u');
        next unless $uri;
        if (!$hrecs->{$loc_key}->{electronicAccess}) {
          $hrecs->{$loc_key}->{electronicAccess} = []; 
        } 
        my $eaObj = {};
        $eaObj->{uri} = $uri;
        my $lt = $_->as_string('y');
        $eaObj->{linkText} = $lt if $lt;
        $eaObj->{publicNote} = $_->as_string('z');
        my $indval = $_->{_ind2};
        my $relname = $rel_ind->{$indval};
        $eaObj->{relationshipId} = $folio_rel->{$relname};
        push $hrecs->{$loc_key}->{electronicAccess}, $eaObj;
      }
      $hcount++;
    }

    # create item 
    my $irec = {};
    my $hrid = $_->as_string('q');
    if ($hrid && !$item_seen->{$hrid}) {
      $item_seen->{$hrid} = 1;
      my $barcode = $_->as_string('b');
      my $coll_code = $_->as_string('c');

      $irec->{id} = uuid($hrid);
      $irec->{holdingsRecordId} = $hrecs->{$loc_key}->{id};
      $irec->{barcode} = $barcode;
      $irec->{volume} = $_->as_string('f');
      my $coll_name = $coll_map->{$coll_code} || 'Other';
      $irec->{materialTypeId} = $folio_mtypes->{$coll_name} || $folio_mtypes->{Other};
      $irec->{permanentLoanTypeId} = $loan_type_id;
      $irec->{itemLevelCallNumber} = $callno;
      $irec->{itemLevelCallNumberTypeId} = $cn_type_id;
      $irec->{effectiveCallNumberComponents} = { callNumber => $callno, typeId => $cn_type_id };
      if ($hrecs->{$loc_key}->{electronicAccess}) {
        $irec->{electronicAccess} = $hrecs->{$loc_key}->{electronicAccess};
      }
      $irec->{status} = { name => 'Available' };
      $irec->{hrid} = $hrid;
      $irec->{notes} = [];
      my $note_text = $_->subfield('h');
      if ($note_text) {
        my $note = {};
        $note->{note} = $note_text;
        $note->{itemNoteTypeId} = $folio_notes->{Note};
        $note->{staffOnly} = "true";
        push $irec->{notes}, $note;
      }
      push $icoll->{items}, $irec;
      $icount++;
    }
  }
  foreach (keys $hrecs) {
    push $hcoll->{holdingsRecords}, $hrecs->{$_};
  }
  $mcount++;
  print "# $mcount [$control_num]\n"
}

$hcoll->{totalRecords} = $hcount;
my $hcollection = JSON->new->pretty->encode($hcoll);
my $hold_file = "$batch_path/${filename}_holdings.json";
open HLD, ">:encoding(UTF-8)", $hold_file;
print HLD $hcollection;
# print $hcollection;
close HLD;

$icoll->{totalRecords} = $icount;
my $icollection = JSON->new->pretty->encode($icoll);
my $items_file = "$batch_path/${filename}_items.json";
open ITM, ">:encoding(UTF-8)", $items_file;
print ITM $icollection;
# print $icollection;
close ITM;

print "\nHoldings: $hcount";
print "\nItems:    $icount\n";