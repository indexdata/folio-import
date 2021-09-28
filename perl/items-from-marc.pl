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

my $fname = basename($mrcfile, '.mrc', '.marc', '.out', '.dat');
my $savedir = dirname($mrcfile);
my $hpath = "$savedir/$fname-holdings.jsonl";
my $ipath = "$savedir/$fname-items.jsonl";
unlink $hpath;
unlink $ipath;
open HOUT, ">>", $hpath or die "Can't write to $hpath!";
open IOUT, ">>", $ipath or die "Can't write to $ipath!";

my $json = JSON->new;
$json->canonical();

my $pro = Config::Tiny->read($profile_path);
my $bidfield = $pro->{settings}->{bib_id_field};
my $itemtag = $pro->{settings}->{item_rec_tag};
my $imap = $pro->{mapping};

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
my $icount = 0;
my $hcount = 0;
while (<RAW>) {
  $count++;
  my $raw = $_;
  my $marc = MARC::Record->new_from_usmarc($raw);
  my $bid = '';
  if ($bidfield =~ /^00/) {
    my $ctrlfield = $marc->field($bidfield);
    if ($ctrlfield) {
      $bid = $ctrlfield->data();
    }
  } else {
    my ($t, $s) = split(/\$/, $bidfield);
    $bid = ($marc->subfield($t, $s))[0];
  }
  if ($pro->{settings}->{strip_leading_dot} && $pro->{settings}->{strip_leading_dot} eq "y") {
    $bid =~ s/^\.//;
  }
  if ($pro->{settings}->{strip_check_digit} && $pro->{settings}->{strip_check_digit} eq "y") {
    $bid =~ s/\w$//;
  }
  my $hseen = {};
  my $hid = '';
  foreach my $item ($marc->field($itemtag)) {
    my $holdings = {};
    my $folitem = {};
    my $hkey = '';
    foreach my $sf (keys %{ $imap }) {
      my @col = split(/\|/, $imap->{$sf});
      my $folfield = $col[0];
      my $type = $col[1];
      my $repeat = $col[2];
        foreach my $data ($item->subfield($sf)) {
          $data =~ s/\s+$//;
          if ($type =~ /i/) {
            if ($repeat eq "y") {
              $folitem->{$folfield} = [] if !$folitem->{folfield};
              push @{ $folitem->{$folfield} }, $data;
            } else {
              $folitem->{$folfield} = $data;
              last;
            }
          }
          if ($type =~ /h/) {
            if ($folfield eq 'permanentLocationId') {
              $hkey = "$bid-$data";
              if (!$hseen->{$hkey}) {
                $holdings->{$folfield} = $data;
                $holdings->{hrid} = $hkey;
                $holdings->{id} = uuid($hkey);
                $holdings->{instanceId} = $bid;
                $hid = $holdings->{id};
                $hseen->{$hkey} = 1;
              } else {
                $hseen->{$hkey}++;
              }
            }
          }
      }
    }
    if ($hseen->{$hkey} && $hseen->{$hkey} == 1) {
      $hcount++;
      my $hout = $json->encode($holdings);
      print HOUT $hout . "\n";
    }
    if ($folitem->{hrid}) {
      $icount++;
      $folitem->{holdingsRecordId} = $hid;
      $folitem->{id} = uuid($folitem->{hrid});
      my $iout = $json->encode($folitem);
      print IOUT $iout . "\n";
    }
  } 
}

print "Finished!";
print "Marc records in: $count\n";
print "Holdings records out: $hcount\n";
print "Item records out: $icount\n";

sub uuid {
  my $text = shift;
  my $uuid = create_uuid_as_string(UUID_V5, $text);
  return $uuid;
}