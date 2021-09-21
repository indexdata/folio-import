#! /usr/bin/perl

use strict;
use warnings;
use MARC::Record;
use Data::Dumper;
use JSON;
use UUID::Tiny ':std';
use File::Basename;
use Config::Tiny;

binmode STDOUT, ":utf8";

my $profile_path = shift;
my $mrcfile = shift;

if (!$mrcfile) {
  die "Usage: ./items-from-marc.pl <profile> <marc_record_file>\n";
}

my $pro = Config::Tiny->read($profile_path);
print Dumper($pro);
my $bidfield = $pro->{settings}->{bib_id_field};
my $itemtag = $pro->{settings}->{item_rec_tag};
my $map = $pro->{mapping};
my $ftypes = {
  accessionNumber=>"string",
  barcode=>"string",
  chronology=>"string",
  circulationNotes=>"array",
  copyNumber=>"string",
  descriptionOfPieces=>"string",
  discoverySuppress=>"boolean",
  effectiveCallNumberComponents=>"object",
  effectiveLocationId=>"string",
  effectiveShelvingOrder=>"string",
  electronicAccess=>"array",
  enumeration=>"string",
  formerIds=>"array",
  holdingsRecord2=>"object",
  holdingsRecordId=>"string",
  hrid=>"string",
  id=>"string",
  inTransitDestinationServicePointId=>"string",
  itemDamagedStatusDate=>"string",
  itemDamagedStatusId=>"string",
  itemIdentifier=>"string",
  itemLevelCallNumber=>"string",
  itemLevelCallNumberPrefix=>"string",
  itemLevelCallNumberSuffix=>"string",
  itemLevelCallNumberTypeId=>"string",
  lastCheckIn=>"object",
  materialType=>"object",
  materialTypeId=>"string",
  metadata=>"object",
  missingPieces=>"string",
  missingPiecesDate=>"string",
  notes=>"array",
  numberOfMissingPieces=>"string",
  numberOfPieces=>"string",
  permanentLoanTypeId=>"string",
  permanentLocation=>"object",
  permanentLocationId=>"string",
  purchaseOrderLineIdentifier=>"string",
  statisticalCodeIds=>"array",
  status=>"object",
  tags=>"object",
  temporaryLoanTypeId=>"string",
  temporaryLocation=>"object",
  temporaryLocationId=>"string",
  volume=>"string",
  yearCaption=>"array"
};

$/ = "\x1D";
open RAW, $mrcfile;
my $count = 0;
while (<RAW>) {
  $count++;
  my $raw = $_;
  my $marc = MARC::Record->new_from_usmarc($raw);
  my $bid = '';
  if ($bidfield =~ /^00/) {
  } else {
    my ($t, $s) = split(/\$/, $bidfield);
    $bid = $marc->subfield($t, $s);
  }
  foreach my $item ($marc->field($itemtag)) {
    my $folitem = {};
    foreach my $sf (sort keys %$map) {
      my $folfield = $map->{$sf};
        foreach my $data ($item->subfield($sf)) {
          if ($ftypes->{$folfield} eq "array") {
            $folitem->{$folfield} = [] if !$folitem->{folfield};
            push @{ $folitem->{$folfield} }, $data;
          } else {
            $folitem->{$folfield} = $data;
            last;
          }
      }
    }
    print Dumper($folitem);
  } 
}

sub uuid {
  my $text = shift;
  my $uuid = create_uuid_as_string(UUID_V5, $text);
  return $uuid;
}