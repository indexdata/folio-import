#! /usr/bin/perl

# Create Folio holdings and items from Simmons III Marc Records.
# Holdings are created by unique location and call number.
# Call numbers are mapped from separate flat file.
# Item data is in the 945 field.
# The mapping is based on 001 to instance.id.
# Use this to generate holdings to go with previously converted instances recordse

use MARC::Record;
use Data::Dumper;
use JSON;
use Data::UUID;

my $refpath = '../data/SIMREF';

binmode STDOUT, ":utf8";

my $infile = shift or die "Usage: items_sim.pl <batch_directory>\n";
if (! -e $infile) {
  die "Can't find input file!\n"
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
    $ret->{$_->{name}} = $_->{id};
  }
  close REF;
  return $ret;
}

# load folio reference data 
my $folio_locs = get_ref_data('locations.json', 'locations');
my $folio_mtypes = get_ref_data('material-types.json', 'mtypes');
my $folio_rel = get_ref_data('electronic-access-relationships.json', 'electronicAccessRelationships');
my $folio_notes = get_ref_data('item-note-types.json', 'itemNoteTypes');
print Dumper($folio_notes);

# get location mappings from tsv file
my $locmap = {};
open LOC, "$refpath/locations.tsv" or die "Can't find locations.tsv file\n";
while (<LOC>) {
  my @col = split /\t/;
  $col[4] =~ s/\s*$//;
  $locmap->{$col[0]} = $col[4];
}
close LOC;

# get itype mappings from tsv file
my $itypemap = {};
open ITP, "$refpath/itypes.tsv" or die "Can't find itypes.tsv file\n";
while (<ITP>) {
  my @col = split /\t/;
  next unless $col[0] =~ /^\d+$/;
  $itypemap->{$col[0]} = $col[5];
}
close ITP;

# get callno mappings from txt file
my $cnmap = {};
open CN, "$refpath/sim_callno.txt" or die "Can't find sim_callno.txt file\n";
while (<CN>) {
  my ($id, $cn) = split /","/;
  $id =~ s/^"/./;
  $cn =~ s/"\s*$//;
  $cnmap->{$id} = $cn;
}
close CN;

# load bib id to instance id map
$/ = '';
my $inst_map_file = $infile;
$inst_map_file =~ s/\.(mrc|marc)$/_map.json/;
open INST, "$inst_map_file" or die "Can't find instance id file: $inst_map_file\n";
my $inst_map_str = <INST>;
my $inst_map = decode_json($inst_map_str);
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
  'p' => 'Note',
  'g' => 'Note',
  'f' => 'Note',
  'o' => 'Note',
  'c' => 'Note',
  's' => 'Note'
};

# status note map
my $status_note = {
  's' => ['Note','On search',true],
  'o' => ['Note','Library use only',false],
  'd' => ['Review','On order',true],
  'l' => ['Review','Lost',true],
  'b' => ['Review','At bindery',true],
  'w' => ['Action note','Withdrawn',true],
  'e' => ['Note','Online',false],
  'g' => ['Review','Media L232',true],
  'a' => ['Note','Library use only, ask archivist',false],
  '^' => ['Review','Request',true],
  'j' => ['Note','Faculty use only',false],
  'k' => ['Review','New book shelf',true],
  'x' => ['Note','MCB Boardroom',true]
};

# set static callno type to LC
my $cn_type_id = '95467209-6d7b-468b-94df-0f5d7ad2747d';

# set static loantype to "can circulate"
my $loan_type_id = '2b94c631-fca9-4892-a730-03ee529ffe27';

# open a collection of raw marc records
$/ = "\x1D";
open RAW, "<:encoding(UTF-8)", $infile;
my $hcoll = { holdingsRecords => [] };
my $icoll = { items => [] };
my $hcount = 0;
my $icount = 0;
while (<RAW>) {
  my $hrecs = {};
  $raw = $_;
  my $marc = MARC::Record->new_from_usmarc($raw);
  my $control_num = $marc->field('001')->as_string();
  my $iii_num = $marc->field('907')->as_string('a');
  my @marc_items = $marc->field('945');
  foreach (@marc_items) {
    my $loc_code = $_->as_string('l');
    $loc_code =~ s/^\s+|\s+$//g;
    # create holdings record if record doesn't already exists for said location
    if (!$hrecs->{$loc_code}) {
      my $ug = Data::UUID->new;
      my $uuid = $ug->create();
      my $uustr = lc($ug->to_string($uuid));
      $hrecs->{$loc_code}->{id} = $uustr;
      $hrecs->{$loc_code}->{instanceId} = $inst_map->{$control_num};
      $hrecs->{$loc_code}->{callNumber} = $cnmap->{$iii_num};
      $hrecs->{$loc_code}->{callNumberTypeId} = $cn_type_id;
      my $loc_name = $locmap->{$loc_code};
      $hrecs->{$loc_code}->{permanentLocationId} = $folio_locs->{$loc_name} || $loc_code;
      my @url_fields = $marc->field('856');
      foreach (@url_fields) {
        if (!$hrecs->{$loc_code}->{electronicAccess}) {
          $hrecs->{$loc_code}->{electronicAccess} = []; 
        } 
        my $eaObj = {};
        $eaObj->{uri} = $_->as_string('u');
        $eaObj->{publicNote} = $_->as_string('z');
        $eaObj->{publicNote} = $_->as_string('3');
        my $indval = $_->{_ind2};
        my $relname = $rel_ind->{$indval};
        $eaObj->{relationshipId} = $folio_rel->{$relname};
        push $hrecs->{$loc_code}->{electronicAccess}, $eaObj;
      }
      $hcount++;
    }

    # create item 
    my $irec = {};
    $irec->{holdingsRecordId} = $hrecs->{$loc_code}->{id};
    $irec->{barcode} = $_->as_string('i') || '';
    $irec->{volume} = $_->as_string('c');
    my $itype_code = $_->as_string('t');
    my $itype_name = $itypemap->{$itype_code};
    $irec->{materialTypeId} = $folio_mtypes->{$itype_name};
    $irec->{permanentLoanTypeId} = $loan_type_id;
    $irec->{copyNumbers} = [ $_->as_string('g') ];
    my $status = $_->as_string('s');
    $irec->{status} = { name => $status_map->{$status} || 'Available' };
    $irec->{formerIds} = [ $_->as_string('y')];
    my $iii_note_type = $_->as_string('o');
    if ($iii_note_type =~ /[cso]/) {
      $irec->{discoverySuppress} = true;
    }
    $irec->{notes} = [];
    foreach ($_->subfield('n')) {
      my $note = {};
      $note->{note} = $_;
      $item_note_label = $item_notes->{$iii_note_type};
      $note->{itemNoteTypeId} = $folio_notes->{$item_note_label};
      if ($iii_note_type =~ /[pgfcs]/ || $status =~ /[mc]/) {
        $note->{staffOnly} = true;
      } else {
        $note->{staffOnly} = false;
      }
      push $irec->{notes}, $note;
    }
    if ($status =~ /[sordlbwega^kjx]/) {
      my $note = {};
      $note->{note} = $status_note->{$status}[1];
      my $note_label = $status_note->{$status}[0];
      $note->{itemNoteTypeId} = $folio_notes->{$note_label};
      $note->{staffOnly} = $status_note->{$status}[2];
      push $irec->{notes}, $note; 
    }
    if ($status eq 'h') {
      $irec->{temporaryLocationId} = 'Reserve cart'
    }
    push $icoll->{items}, $irec;
    $icount++;
  }
  foreach (keys $hrecs) {
    push $hcoll->{holdingsRecords}, $hrecs->{$_};
  }
}

$hcoll->{totalRecords} = $hcount;
my $hcollection = JSON->new->pretty->encode($hcoll);
my $holdings_file = "$batch_path/${filename}_holdings.json";
open HLD, ">:encoding(UTF-8)", $holdings_file;
print HLD $hcollection;
# print $hcollection;
close HLD;

$icoll->{totalRecords} = $icount;
my $icollection = JSON->new->pretty->encode($icoll);
my $items_file = "$batch_path/${filename}_items.json";
open ITM, ">:encoding(UTF-8)", $items_file;
print ITM $icollection;
print $icollection;
close ITM;

print "\nHoldings: $hcount";
print "\nItems:    $icount\n";