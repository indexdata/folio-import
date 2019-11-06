#! /usr/bin/perl

# Create Folio holdings with matching id to bib record.
# Set $refpath to location of downloaded reference data. 

use MARC::Record;
use Data::Dumper;
use JSON;
use Data::UUID;

binmode STDOUT, ":utf8";
$| = 1;

my $refpath = '../data/WITREF';

my $ctrl_file = shift;
my $infile = shift or die "Usage: ./mfhd2json.pl <uuid_map_file> <raw_marc_mfhd_collection>\n";
if (! -e $infile) {
  die "Can't find mfhd file!\n"
}
if (! -e $ctrl_file) {
  die "Can't find id to uuid map file\n";
}
my $limit = shift || 1000000;
my $save_path = $ctrl_file;
$save_path =~ s/\.\w+$/_holdings.json/;
print "Saving to $save_path\n";

sub getIds {
  local $/ = '';
  open IDS, $ctrl_file or die "Can't open $ctrl_file\n";
  my $jsonstr = <IDS>;
  my $json = decode_json($jsonstr);
  return $json;
}

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

my $id_map = getIds();

# load folio reference data 
my $folio_locs = get_ref_data('locations.json', 'locations');
my $folio_hnotes = get_ref_data('holdings-note-types.json', 'holdingsNoteTypes');
# my $folio_rel = get_ref_data('electronic-access-relationships.json', 'electronicAccessRelationships');



my $voyager_locs = {};
open VLOCS, "$refpath/locations.tsv" or die "Can't find locations.tsv!\n";
while (<VLOCS>) {
  my @f = split /\t/;
  $voyager_locs->{$f[0]} = $f[3];
}

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
my $cn_type_id = '03dd64d0-5626-4ecd-8ece-4531e0069f35';
my $cn_other_id = '6caca63e-5651-4db6-9247-3205156e9699';

# set static loantype to "can circulate"
my $loan_type_id = '2b94c631-fca9-4892-a730-03ee529ffe27';

# open a collection of raw marc records
$/ = "\x1D";
open RAW, "<:encoding(UTF-8)", $infile;
my $hcoll = { holdingsRecords=>[] };
my $hcount = 0;
while (<RAW>) {
  last if $hcount >= $limit;
  $raw = $_;
  $hrec = {};
  my $marc = MARC::Record->new_from_usmarc($raw);
  my $bib_num = $marc->field('004')->{_data};
  print STDOUT "\r$hcount";
  next unless $id_map->{$bib_num};
  my $control_num = $marc->field('001')->{_data};
  my $loc = $marc->field('852');

  my $ug = Data::UUID->new;
  my $uuid = $ug->create();
  my $uustr = lc($ug->to_string($uuid));
  $hrec->{id} = $uustr;
  $hrec->{formerIds} = [ $control_num ];
  $hrec->{instanceId} = $id_map->{$bib_num};

  # $hrec->{instanceId} = $inst_map->{$control_num};
  my $locstr = $loc->as_string('b');
  my $locname = $voyager_locs->{$locstr};
  $hrec->{permanentLocationId} = $folio_locs->{$locname} || $locname || $locstr;

  # call number and type
  $hrec->{callNumber} = $loc->as_string('h') || $loc->as_string('k');
  if ($loc->{_ind1} eq '1') {
    $hrec->{callNumberTypeId} = $cn_type_id;
  } else {
    $hrec->{callNumberTypeId} = $cn_other_id;
  }

  # notes section
  my $pnote = $loc->as_string('z');
  if ($pnote) {
    $hrec->{notes} = [];
    my $nt = { note=>$pnote, holdingsNoteTypeId=>$folio_hnotes->{Note} };
    push $hrec->{notes}, $nt;
  }
  my $snote = $loc->as_string('x');
  if ($snote) {
    if (!$hrec->{notes}) {
      $hrec->{notes} = [];
    }
    my $nt = { note=>$snote, holdingsNoteTypeId=>$folio_hnotes->{Note}, staffOnly=>'true' };
    push $hrec->{notes}, $nt;
  }


  # deal with enumeration and receivingHistory
  my @enum_fields = $marc->field('863');
  if (@enum_fields) {
    $hrec->{receivingHistory}->{displayType} = '1';
    $hrec->{receivingHistory}->{entries} = [];
    foreach (@enum_fields) {
      push $hrec->{receivingHistory}->{entries}, { enumeration=>$_->as_string('a'), publicDisplay=>'true' };
    }
  }
  
  # deal with chronology and receivingHistory
  my @text_holdings = $marc->field('866');
  if (@text_holdings) {
    if (!$hrec->{receivingHistory}) {
      $hrec->{receivingHistory}->{displayType} = '1';
      $hrec->{receivingHistory}->{entries} = [];
    }
    foreach (@text_holdings) {
      push $hrec->{receivingHistory}->{entries}, { chronology=>$_->as_string('a'), publicDisplay=>'true' };
    }
  }

  # deal with holdings statements for supplements
  my @sups_fields = $marc->field('867');
  if (@sups_fields) {
    $hrec->{holdingsStatementsForSupplements} = [];
    foreach (@sups_fields) {
      push $hrec->{holdingsStatementsForSupplements}, { statement=>$_->as_string('a') };
    }
  }  

  # electronicAccess section
  my @url_fields = $marc->field('856');
  foreach (@url_fields) {
    if (!$hrec->{electronicAccess}) {
      $hrec->{electronicAccess} = []; 
    } 
    my $eaObj = {};
    $eaObj->{uri} = $_->as_string('u');
    $eaObj->{publicNote} = $_->as_string('z');
    my $indval = $_->{_ind2};
    my $relname = $rel_ind->{$indval};
    # $eaObj->{relationshipId} = $folio_rel->{$relname};
    push $hrec->{electronicAccess}, $eaObj;
  }
  $hcount++;
  push $hcoll->{holdingsRecords}, $hrec;
}

$hcoll->{totalRecords} = $hcount;
my $hcollection = JSON->new->pretty->encode($hcoll);
open HLD, ">:encoding(UTF-8)", $save_path;
print HLD $hcollection;
# print $hcollection;
close HLD;

print "\nHoldings: $hcount\n";