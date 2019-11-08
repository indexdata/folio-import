#! /usr/bin/perl

# Create Folio items from WIT JSON item records.

use Data::Dumper;
use JSON;
use Data::UUID;

my $refpath = '../data/WITREF';

binmode STDOUT, ":utf8";
$| = 1;

my $h2i_file = shift;
my $infile = shift or die "Usage: items_sim.pl <holdings2item_map> <items_file.json>\n ";
if (! -e $infile) {
  die "Can't find input file!\n "
}
my $filename = $infile;
$filename =~ s/^(.+\/)?(.+)\..+$/$2/;
my $batch_path = $1;

sub uuid {
  my $ug = Data::UUID->new;
  my $uuid = $ug->create();
  my $uustr = lc($ug->to_string($uuid));
  return $uustr;
}

sub get_hmap {
  local $/ = '';
  open HMAP, "<:encoding(UTF-8)", $h2i_file;
  my $jsonstr = <HMAP>;
  return decode_json($jsonstr);
}

my $h2i_map = get_hmap();
# print Dumper($h2i_map);

sub get_items {
  local $/ = '';
  open ITM, "<:encoding(UTF-8)", $infile;
  my $jsonstr = <ITM>;
  return decode_json($jsonstr);
}

my $items = get_items();
# print Dumper($items);

sub get_ref_data {
  my $path = shift;
  my $prop = shift;
  local $/ = '';
  open REF, "<:encoding(UTF-8)", "$refpath/$path" or die "Can't find reference file: $path\n ";
  my $ref_str = <REF>;
  my $ref_json = decode_json($ref_str);
  my $ret = {};
  foreach (@{ $ref_json->{$prop} }) {
    $ret->{$_->{name}} = $_->{id};
  }
  close REF;
  return $ret;
}

# load folio reference data 
my $folio_locs = get_ref_data('locations.json', 'locations');
my $folio_mtypes = get_ref_data('material-types.json', 'mtypes');
# my $folio_rel = get_ref_data('electronic-access-relationships.json', 'electronicAccessRelationships');
my $folio_notes = get_ref_data('item-note-types.json', 'itemNoteTypes');

# get location mappings from tsv file
my $locmap = {};
open LOC, "$refpath/locations.tsv" or die "Can't find locations.tsv file\n ";
while (<LOC>) {
  my @col = split /\t/;
  $col[4] =~ s/\s*$//;
  $locmap->{$col[0]} = $col[3];
}
close LOC;

# get itype mappings from tsv file
my $itypemap = {};
open ITP, "$refpath/itypes.tsv" or die "Can't find itypes.tsv file\n ";
while (<ITP>) {
  my @col = split /\t/;
  next unless $col[0] =~ /^\w/;
  $col[0] = uc $col[0]; # normalize voyager name.
  $itypemap->{$col[0]} = $col[3];
}
close ITP;
# print Dumper($itypemap); exit;

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
  'Not Charged' => 'Available',
  'Charged' => 'Checked out',
  'Renewed' => 'Checked out',
  'Overdue' => 'Checked out',
  'Recall Request' => 'Paged',
  'Hold Request' => 'Paged',
  'On Hold' => 'Awaiting pickup',
  'In Transit' => 'In transit',
  'In Transit Discharged' => 'In transit',
  'In Transit On Hold' => 'Awaiting pickup',
  'Discharged' => 'Available',
  'Missing' => 'Missing',
  'Lost--Library Applied' => 'Missing',
  'Lost--System Applied' => 'Missing',
  'Claims Returned' => 'Checked out',
  'Damaged' => 'In process',
  'Call Slip Request' => 'In process'
};

# set static callno type to LC
my $cn_type_id = '95467209-6d7b-468b-94df-0f5d7ad2747d';

# set static loantype to "can circulate"
my $loan_type_id = '2b94c631-fca9-4892-a730-03ee529ffe27';

my $damaged = 'afe30448-0331-44ac-8159-e13433f9a1b0';
my $not_damaged = 'f3870a55-4159-4083-a858-2d47e260f43b';

# month map for created date.
my $months = {
  JAN=>'01',
  FEB=>'02',
  MAR=>'03',
  APR=>'04',
  MAY=>'05',
  JUN=>'06',
  JUL=>'07',
  AUG=>'08',
  SEP=>'09',
  OCT=>'10',
  NOV=>'11',
  DEC=>'12'
};

my @lt = localtime;
my $yr = $lt[5] + 1900;
my $mo = $lt[4] + 1;
$mo =~ s/^(\d)$/0$1/;
my $dy = $lt[3];
$dy =~ s/^(\d)$/0$1/;
my $today = "$yr-$mo-$dy";

my $icoll = { items => [] };
my $icount = 0;
foreach (@$items) {
  # create item 
  print STDOUT "\r$icount";
  my $irec = {};
  $irec->{notes} = [];
  my $cdate = $_->{create_date};
  my @d = split '-', $cdate;
  if ($d[2] =~ /^[01]/) {
    $d[2] = "20$d[2]";
  } else {
    $d[2] = "19$d[2]";
  }
  my $created_date = $d[2] . "-" . $months->{$d[1]} . "-" . $d[0];
  $irec->{metadata} = { createdDate=>$created_date };
  $irec->{id} = uuid();
  my $iid = $_->{item_id};
  my $mid = $_->{mfhd_id};
  $irec->{holdingsRecordId} = $h2i_map->{$mid} or die "\nCan't find MFHD ID $mid in h2i_map\n ";
  $irec->{formerIds} = [ $iid, "mfhd:$mid" ];
  my $permloc = $_->{perm_location};
  if ($permloc) {
    my $locstr = $locmap->{$permloc} or die "\nCan't find \"$permloc\" in locmap\n";
    $irec->{temporaryLocationId} = $folio_locs->{$locstr} or die "\nCan't find temporaryLocationId for \"$locstr\" in folio_locs map\n ";
  }
  my $tmploc = $_->{temp_location};
  if ($tmploc) {
    my $locstr = $locmap->{$tmploc} or die "\nCan't find \"$tmploc\" in locmap\n ";
    $irec->{temporaryLocationId} = $folio_locs->{$locstr} or die "\nCan't find temporaryLocationId for \"$locstr\" in folio_locs map\n ";
  }
  $irec->{volume} = $_->{enum} if $_->{enum};
  $irec->{barcode} = $_->{barcode} || '';
  my $damaged_flag = 0;
  my $lost_flag = 0;
  foreach (@{ $_->{status} }) {
    $damaged_flag = 1 if /Damaged/;
    $lost_flag = 1 if /Lost--Sys/;
  }
  my $status = $_->{status}[0];
  my $status_name = $status_map->{$status} or die "\nStatus \"$status\" not found in status_map\n ";
  $irec->{status} = $status_name; 
  if ($lost_flag) {
    push $irec->{notes}, make_note('Note', 'Lost--System Applied', true);
  }
  if ($damaged_flag) {
    $irec->{itemDamagedStatusId} = $damaged;
    $irec->{itemDamagedStatusDate} = $today;
  }

  my $itype_voyager = uc $_->{item_type}; # normalize voyager status
  my $itype_name = $itypemap->{$itype_voyager} or die "\nCan't find '$itype_voyager' in itypemap\n ";
  $irec->{materialTypeId} = $folio_mtypes->{$itype_name} || $itype_code;
  $irec->{permanentLoanTypeId} = $loan_type_id;
  
  push $icoll->{items}, $irec;
  # print IIDS $irec->{holdingsRecordId} . "|" . $irec->{formerIds}[0] . "\n";
  $icount++;
}

sub make_note {
  my $note_name = shift;
  my $text = shift;
  my $staff = shift;
  my $note = {};
  $note->{itemNoteTypeId} = $folio_notes->{$note_name} or die "\n#$icount : Can't find \"$note_name\" in folio_notes.\n ";
  $note->{note} = $text;
  if ($staff) {
    $note->{staffOnly} = $staff;
  } else {
    $note->{staffOnly} = false;
  }
  return $note;
}

$icoll->{totalRecords} = $icount;
my $icollection = JSON->new->pretty->encode($icoll);
my $items_file = "$batch_path/${filename}_items.json";
open ITM, ">:encoding(UTF-8)", $items_file;
print ITM $icollection;
print $icollection;
close ITM;

print "\nItems:    $icount\n";