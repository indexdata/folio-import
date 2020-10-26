#! /usr/bin/perl

# Create Folio holdings and items from quasi json files.
# The instances map needs to be located in the same directory as the holdings records.

use strict;
use warnings;
use Data::Dumper;
use JSON;
use Data::UUID;

binmode STDOUT, ":utf8";

my $limit = 1000000;

unless ($ARGV[1]) {
  die "Usage: items_spl.pl <ref_data_path> <holdings_file>\n"
}

my $refpath = shift;
if (! -e $refpath) {
  die "Can't find ref data directory!\n"
}
my $infile = shift;
if (! -e $infile) {
  die "Can't find input file!\n"
}

my $namespace = 'dfc59d30-cdad-3d03-9dee-d99117852eab';
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
my $folio_dmg = get_ref_data('item-damaged-statuses.json', 'itemDamageStatuses');

#open collections.tsv map
my $coll_map = {};
open COLL, "$refpath/collections.tsv" or die "Can't open collections.tsv file";
while (<COLL>) {
  chomp;
  my ($k, $v, $o) = split(/\t/);
  $coll_map->{$k} = $v;
}

# load bib id to instance id map
my $inst_map_file = "${batch_path}instances.map";
my $inst_map = {};
open INST, "$inst_map_file" or die "Can't find instance id file: $inst_map_file\n";
while (<INST>) {
  chomp;
  my ($k, $v) = split(/\|/);
  $inst_map->{$k} = $v;
}
close INST;

my @lt = localtime();
my $mdate = sprintf("%04d-%02d-%02dT%02d:%02d:%02d-0500", $lt[5] + 1900, $lt[4] + 1, $lt[3], $lt[2], $lt[1], $lt[0]);
my $user = 'e27cb427-2280-5130-a25e-c762cfc210f7';
my $metadata = {
  createdDate => $mdate,
  createdByUserId => $user,
  updatedDate => $mdate,
  updatedByUserId => $user
};

# set relationship indicator map
my $rel_ind = {
  '0' => 'Resource',
  '1' => 'Version of resource',
  '2' => 'Related resource',
  '8' => 'No display constant generated',
  ' ' => 'No information provided'
};

my $status_note = {};

# set static callno type to Dewey 
my $dewey_cn = '03dd64d0-5626-4ecd-8ece-4531e0069f35';

# set lc callno type
my $lc_cn = '95467209-6d7b-468b-94df-0f5d7ad2747d';

# set other callno type
my $other_cn = '6caca63e-5651-4db6-9247-3205156e9699';

# set static loantype to "can circulate"
my $loan_type_id = '2b94c631-fca9-4892-a730-03ee529ffe27';

# create json object
open RAW, "<:encoding(UTF-8)", $infile;
my $hi = { items => [] };
my $jtext;
while (<RAW>) {
  s/^\s+//;
  s/\s+$//;
  s/("available_date": )None/$1"None"/;  # This fixes an error in the source json where the string "None" is not quoted!
  if (/^\{/) {
    $jtext = $_;
  } elsif (/^}/) {
    $jtext .= $_;
    my $jobj = decode_json($jtext);
    push @{ $hi->{items} }, $jobj;
  } else {
    $jtext .= $_
  }
}

my $item_seen = {};
my $hcoll = { holdingsRecords => [] };
my $icoll = { items => [] };
my $hcount = 0;
my $icount = 0;
my $mcount = 0;
my $hrec_num = {};
foreach (@{ $hi->{items} }) {
  my $hrecs = {};
  my $control_num = $_->{'bib#'};
  $hrec_num->{$control_num}++;
  if (!$inst_map->{$control_num}) {
    print "$control_num not found in inst_map\n";
    next;
  }
  my $callno = $_->{call_reconstructed};
  my $cn_type_id;
  if ($callno =~ /^\d{3}(\.|$)/) { # dewey
      $cn_type_id = $dewey_cn;
    } elsif ($callno =~ /^[A-Z]{1,2}\d/) {
      $cn_type_id = $lc_cn;
    } else {
      $cn_type_id = $other_cn;
    }
  my $loc_code = $_->{location};
  if (!$loc_code) {
    print "WARN No location code-- skipping...\n";
    next;
  }
  $loc_code = lc $loc_code;
  my $loc_key = "$loc_code-$callno";
  $loc_code =~ s/^\s+|\s+$//g;

  # create holdings record if record doesn't already exists for said location
  if (!$hrecs->{$loc_key}) {
    my $hrid = "$control_num-" . sprintf("%03d", $hrec_num->{$control_num});
    $hrecs->{$loc_key}->{hrid} = $hrid;
    my $uustr = uuid($hrid);
    $hrecs->{$loc_key}->{id} = $uustr;
    $hrecs->{$loc_key}->{instanceId} = $inst_map->{$control_num};
    $hrecs->{$loc_key}->{callNumber} = $callno;
    $hrecs->{$loc_key}->{callNumberTypeId} = $cn_type_id;
    $hrecs->{$loc_key}->{permanentLocationId} = $folio_locs->{$loc_code} or die "[$control_num] Can't find permanentLocationId for $loc_code";
    $hrecs->{$loc_key}->{metadata} = $metadata;
    $hcount++;
  }

  # create item 
  my $irec = {};
  my $hrid = $_->{'item#'};
  if ($hrid && !$item_seen->{$hrid}) {
    $item_seen->{$hrid} = 1;
    my $barcode = $_->{ibarcode};
    my $coll_code = $_->{collection};

    $irec->{id} = uuid($hrid);
    $irec->{holdingsRecordId} = $hrecs->{$loc_key}->{id};
    $irec->{barcode} = $barcode;
    my $coll_name = $coll_map->{$coll_code} || 'Other';
    $irec->{materialTypeId} = $folio_mtypes->{$coll_name} || $folio_mtypes->{Other};
    $irec->{permanentLoanTypeId} = $loan_type_id;
    $irec->{itemLevelCallNumber} = $callno;
    $irec->{itemLevelCallNumberTypeId} = $cn_type_id;
    $irec->{effectiveCallNumberComponents} = { callNumber => $callno, typeId => $cn_type_id };
    if ($hrecs->{$loc_key}->{electronicAccess}) {
      $irec->{electronicAccess} = $hrecs->{$loc_key}->{electronicAccess};
    }
    my $st = $_->{item_status};
    my $status = 'Available';
    if ($st eq 'l') {
      $status = 'Declared lost';
    } elsif ($st eq 'w') {
      $status = 'Withdrawn';
    } elsif ($st eq 'sr' || $st eq 'dmg') {
      $status = 'Unknown';
    } elsif ($st eq 'r') {
      $status = 'On order';
    } 
    $irec->{status} = { name => $status };
    $irec->{hrid} = $hrid;
    $irec->{notes} = [];
    my $note_text = $_->{internal_note};
    if ($note_text) {
      my $note = {};
      $note->{note} = $note_text;
      $note->{itemNoteTypeId} = $folio_notes->{Note};
      $note->{staffOnly} = "true";
      push $irec->{notes}, $note;
    }
    my $note_src = $_->{source};
    if ($note_src) {
      my $note = {};
      $note->{note} = $note_src;
      $note->{itemNoteTypeId} = $folio_notes->{Provenance};
      $note->{staffOnly} = "true";
      push $irec->{notes}, $note;
    }
    if ($st eq 'dmg') {
      $irec->{itemDamagedStatusId} = $folio_dmg->{Damaged};
    }
    if ($_->{cki_notes}) {
      $irec->{circulationNotes}->[0] = { note => $_->{cki_notes}, noteType => 'Check in'};
    }

    $irec->{metadata} = $metadata;
    push $icoll->{items}, $irec;
    $icount++;
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