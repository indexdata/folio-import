#! /usr/bin/perl

# Update raw, parsed, sections of SRS records in JSON line format

use strict;
use warnings;
use MARC::Record;
use MARC::Record::MiJ;
use Data::Dumper;
use JSON;

binmode STDOUT, ":utf8";
$| = 1;

my $infile = shift or die "Usage: ./change_source_records.pl <source_records_file.jsonl>\n";

if (! -e $infile) {
  die "Can't find raw Marc file!\n"
}

my $save_path = $infile;
$save_path =~ s/^(.+)\..+$/$1_updated.jsonl/;
unlink $save_path;


# open a collection of SRS records
open RECS, $infile or die "Can't open source record file!";

my $count = 0;
my $ucount = 0;

unlink $save_path;
open OUT, ">>:encoding(UTF-8)", $save_path;

while (<RECS>) {
  chomp;
  $count++;
  my $in_json = decode_json($_);
  my $raw = $in_json->{rawRecord}->{content};
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
  if ($f001) {
    $oldcn = $f001->data();
    $f001->update($hrid);
  } else {
    my @cf;
    $cf[0] = MARC::Field->new('001', $hrid);
    $marc->insert_fields_ordered(@cf);
  }
  while (my $f003 = $marc->field('003')) {
    $oldorg = $f003->data();
    $marc->delete_field($f003);
  } 
  my @nf;
  $nf[0] = MARC::Field->new('003', 'CaEvIII');
  $marc->insert_fields_ordered(@nf);
  
  if ($oldorg ne 'OCoLC' && $oldcn) {
    if ($f035) {
      $oldorg = 'MBSi' unless $oldorg;
      $f035->add_subfields('a', "($oldorg)$oldcn");
    } else {
      my @nf;
      $nf[0] = MARC::Field->new('035', ' ', ' ', 'a'=>"(MBSi)$oldcn");
      $marc->insert_fields_ordered(@nf);
    }
  }
  $in_json->{rawRecord}->{id} = $in_json->{id};
  $in_json->{parsedRecord}->{id} = $in_json->{id};

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
  $in_json->{rawRecord}->{content} = $marc->as_usmarc();
  $in_json->{parsedRecord}->{content} = $parsed;

  # The API should create formattedContent, so the following object is not needed
  # $in_json->{parsedRecord}->{formattedContent} = $marc->as_formatted();

  my $out = JSON->new->encode($in_json);
  print OUT $out . "\n";
  $ucount++;
}
# my $out = JSON->new->pretty->encode($in_json);
# open OUT, ">:encoding(UTF-8)", $save_path;
# print OUT $out;
print "\nDone! $ucount SRS records saved to $save_path\n";
