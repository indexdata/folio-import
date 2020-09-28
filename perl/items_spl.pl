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
my $hcoll = { holdingsRecords => [] };
my $icoll = { items => [] };
my $inum_seen = {};
my $hcount = 0;
my $icount = 0;
my $mcount = 0;
while (<RAW>) {
  my $hrecs = {};
  my $raw = $_;
  my $marc = MARC::Record->new_from_usmarc($raw);
  my $control_num = $marc->field('001')->as_string();
  next if !$inst_map->{$control_num};
  my @marc_items = $marc->field('949');
  foreach (@marc_items) {
    my $callno = $_->as_string('e');
    my $loc_code = $_->as_string('g');
    my $loc_key = "$loc_code-$callno";
    print $loc_key . "\n";
    $loc_code =~ s/^\s+|\s+$//g;
    # create holdings record if record doesn't already exists for said location
    if (!$hrecs->{$loc_key}) {
      my $hrid = "$control_num-$loc_key";
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
    my $barcode = $_->as_string('b');
    my $inum = $_->as_string('q');
    my $hrid;
    if ($inum) {
      $hrid = $inum;
    } else {
      $hrid = "$control_num-$barcode";
    }
    $irec->{id} = uuid($hrid);
    $inum =~ s/^\.(.{8}).*/$1/;
    if ($inum_seen->{$inum}) {
      $inum .= 'd';
    }
    $inum_seen->{$inum} = 1;
    $irec->{holdingsRecordId} = $hrecs->{$loc_key}->{id};
    $irec->{barcode} = $barcode;
    # $irec->{volume} = $_->as_string('c');
    # my $itype_code = $_->as_string('t');
    # my $itype_name = $itypemap->{$itype_code} || 'Review';
    # $irec->{materialTypeId} = $folio_mtypes->{$itype_name} or die "[$iii_num] Can't find materialTypeId for $itype_code";
    $irec->{permanentLoanTypeId} = $loan_type_id;
    # $irec->{copyNumber} = $_->as_string('g');
    $irec->{itemLevelCallNumber} = $callno;
    $irec->{itemLevelCallNumberTypeId} = $cn_type_id;
    $irec->{effectiveCallNumberComponents} = { callNumber => $callno, typeId => $cn_type_id };
    if ($hrecs->{$loc_key}->{electronicAccess}) {
      $irec->{electronicAccess} = $hrecs->{$loc_key}->{electronicAccess};
    }
    # my $status = $_->as_string('s');
    # $irec->{status} = { name => $status_map->{$status} || 'Available' };
    $irec->{hrid} = $hrid;
    my $iii_note_type = $_->as_string('o');
    $irec->{notes} = [];
    my $note_text = $_->subfield('n');
    if ($iii_note_type =~ /[gpfosc]/ or ($iii_note_type eq '-' and $note_text)) {
      my $note = {};
      my $nval;
      if ($iii_note_type eq 'g') {
        $nval = 'Donation';
      } elsif ($iii_note_type eq 'p') {
        $nval = 'Personal copy';
        $nval .= " ($note_text)" if $note_text;
      } elsif ($iii_note_type eq 'f') {
        $nval = 'Reserve folder';
      } elsif ($iii_note_type =~ /[oc-]/) {
        $nval = $note_text;
      } elsif ($iii_note_type eq 's') {
        $nval = 'Suppressed';
      }
      $note->{note} = $nval || "ICODE2: $iii_note_type";
      my $item_note_label = $item_notes->{$iii_note_type};
      # $note->{itemNoteTypeId} = $folio_notes->{$item_note_label} or die "[$iii_num] Can't find itemNoteTypeId for $item_note_label";
      $note->{staffOnly} = "true";
      push $irec->{notes}, $note;
    }
    # if ($status =~ /[sordlbwega^kjx]/) {
      # my $note = {};
      # $note->{note} = $status_note->{$status}[1];
      # my $note_label = $status_note->{$status}[0];
      # $note->{itemNoteTypeId} = $folio_notes->{$note_label};
      # $note->{staffOnly} = $status_note->{$status}[2];
      # push $irec->{notes}, $note; 
    # }
    # if ($status eq 'h') {
      # $irec->{temporaryLocationId} = $folio_locs->{'Reserve Cart'};
    # }
    my $checkout_mesg = $_->as_string('m');
    if ($checkout_mesg) {
      $irec->{circulationNotes} = [];
      my $circ_note = {
        id=>uuid(),
        noteType=>'Check in',
        note=>$checkout_mesg,
        staffOnly=>"true",
        date=>'2020-02-02'
      };
      $circ_note->{source} = { id=>$admin };
      $circ_note->{source}->{personal} = { lastName=>$admin_last, firstName=>$admin_first };
      push $irec->{circulationNotes}, $circ_note;
    }
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