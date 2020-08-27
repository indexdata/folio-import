#! /usr/bin/perl

# Update raw, parsed, and formatted sections of SRS records.

use strict;
use warnings;
use MARC::Record;
use MARC::Record::MiJ;
use Data::Dumper;
use JSON;

binmode STDOUT, ":utf8";
$| = 1;

my $infile = shift or die "Usage: ./change_source_records.pl <source_records_file>\n";

if (! -e $infile) {
  die "Can't find raw Marc file!\n"
}

my $save_path = $infile;
$save_path =~ s/^(.+)\..+$/$1_srs.jsonl/;


# open a collection of SRS records
open RECS, $infile or die "Can't open source record file!";
my $srs_recs = { records=>[] };
$/ = '';
my $in_string = <RECS>;
my $in_json = decode_json($in_string);
$in_string = '';

my $count = 0;
my $ucount = 0;
open OUT, ">>:encoding(UTF-8)", $save_path;

foreach (@{ $in_json->{records} }) {
  $count++;
  my $raw = $_->{rawRecord}->{content};
  print "\r$count";
  my $srs = {};
  my $marc = MARC::Record->new_from_usmarc($raw);

  # Do you editing to MARC fields here...

  #### Simmons Add hrid to 001 field ####
  my $oldorg = '';
  my $oldcn = '';
  my $f001 = $marc->field('001');
  my $f035 = $marc->field('035');
  my $hrid = $marc->subfield('907', 'a');
  next unless $hrid;
  $hrid =~ s/\.(b.......)./$1/;
  $oldcn = $f001->data();
  $f001->update($hrid);
  while (my $f003 = $marc->field('003')) {
    $oldorg = $f003->data();
    $marc->delete_field($f003);
  } 
  my @nf;
  $nf[0] = MARC::Field->new('003', 'CaEvIII');
  $marc->insert_fields_after($f001, @nf);
  
  if ($oldorg ne 'OCoLC') {
    if ($f035) {
      $f035->add_subfields('a', "($oldorg)$oldcn");
    } else {
      my @nf;
      $nf[0] = MARC::Field->new('035', ' ', ' ', 'a'=>"(MBSi)$oldcn");
      $marc->insert_fields_ordered(@nf);
    }
  }

  #### Delete 006/007 fields ####
  
  # my @f006 = $marc->field('006');
  # $marc->delete_field(@f006);
  # my @f007 = $marc->field('007');
  # $marc->delete_field(@f007);

  #### Delete 856 fields where subfield u contains "archive.org" ####

  # foreach ($marc->field('856')) {
  #  if ($_->subfield('u') =~ /archive.org/) {
  #    $marc->delete_field($_);
  #  }
  # }

  # End MARC editing

  my $mij = MARC::Record::MiJ->to_mij($marc);
  my $parsed = decode_json($mij);
  $_->{rawRecord}->{content} = $marc->as_usmarc();
  $_->{parsedRecord}->{content} = $parsed;

  # The API should create formattedContent, so the following object is not needed
  # $_->{parsedRecord}->{formattedContent} = $marc->as_formatted();

  my $out = JSON->new->encode($_);
  print OUT $out . "\n";
  $ucount++;
}
# my $out = JSON->new->pretty->encode($in_json);
# open OUT, ">:encoding(UTF-8)", $save_path;
# print OUT $out;
print "\nDone! $ucount SRS records saved to $save_path\n";
