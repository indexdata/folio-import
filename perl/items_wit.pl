#! /usr/bin/perl

# Create Folio items from WIT JSON item records.

use Data::Dumper;
use JSON;
use Data::UUID;

my $refpath = '../data/WITREF';

binmode STDOUT, ":utf8";

my $infile = shift or die "Usage: items_sim.pl <holdings_file.json>\n";
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

sub get_items {
  local $/ = '';
  open ITM, "<:encoding(UTF-8)", $infile;
  my $jsonstr = <ITM>;
  return decode_json($jsonstr);
}

my $items = get_items();
print Dumper($items);

# load folio reference data 
# my $folio_locs = get_ref_data('locations.json', 'locations');
# my $folio_mtypes = get_ref_data('material-types.json', 'mtypes');
# my $folio_rel = get_ref_data('electronic-access-relationships.json', 'electronicAccessRelationships');
# my $folio_notes = get_ref_data('item-note-types.json', 'itemNoteTypes');

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
# my $itypemap = {};
# open ITP, "$refpath/itypes.tsv" or die "Can't find itypes.tsv file\n";
# while (<ITP>) {
  # my @col = split /\t/;
  # next unless $col[0] =~ /^\d+$/;
  # $itypemap->{$col[0]} = $col[5];
# }
# close ITP;

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
  'o' => 'Library use only',
  'w' => "Withdrawn",
  'i' => "In process"
};

# set static callno type to LC
my $cn_type_id = '95467209-6d7b-468b-94df-0f5d7ad2747d';

# set static loantype to "can circulate"
my $loan_type_id = '2b94c631-fca9-4892-a730-03ee529ffe27';

exit;
# open a collection of raw marc records
my $hcoll = { holdingsRecords => [] };
my $icoll = { items => [] };
my $hcount = 0;
my $icount = 0;
while (<RAW>) {
  my $hrecs = {};
  $raw = $_;
  my $marc = MARC::Record->new_from_usmarc($raw);
  my $control_num = $marc->subfield('907','a');
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
      my $callno = $control_num;
      $hrecs->{$loc_code}->{callNumber} = $cnmap->{$callno};
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
    $irec->{barcode} = $_->as_string('i');
    $irec->{volume} = $_->as_string('c');
    my $itype_code = $_->as_string('t');
    my $itype_name = $itypemap->{$itype_code};
    $irec->{materialTypeId} = $folio_mtypes->{$itype_name};
    $irec->{permanentLoanTypeId} = $loan_type_id;
    $irec->{copyNumbers} = [ $_->as_string('g') ];
    my $status = $_->as_string('s');
    $irec->{status} = { name => $status_map->{$status} || $status };
    $irec->{formerIds} = [ $_->as_string('y')];
    $irec->{notes} = [];
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
print "\nItems:    $icount\n";