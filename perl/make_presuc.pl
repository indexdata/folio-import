#! /usr/bin/perl

use MARC::Record;
use Data::Dumper;
use JSON;

binmode STDOUT, ":utf8";

my $infile = shift or die "Usage: ./make_presuc.pl <raw_marc_file> [<start>]\n";
if (! -e $infile) {
  die "Can't find marc file!\n"
}

my $start = shift || 1;

my $bibids = $infile;
$bibids =~ s/^(.+)\/.*/$1\/bib_ids.txt/;
open BID, $bibids or die "Can't open bib id file at '$bibids'";
my $bib_ids = {};
print "Loading IDs map...\n";
while (<BID>) {
  chomp;
  my @b = split(/\|/);
  $bib_ids->{$b[0]} = $b[1];
}


my $file = $infile;
$file =~ s/^(.+)\/.*/$1\/inst2holdingsMap.json/;
$/ = '';
open INST, $file or die "Can't open $file!";
print "Loading hrid to instanceId map...\n";
my $txt = <INST>;
my $hrid2inst = decode_json($txt);
$txt = '';

$/ = "\x1D";
open RAW, "<:encoding(UTF-8)", $infile;
$outfile = $infile;
$outfile =~ s/(.+)\.\w+$/$1/;
$outfile = "${outfile}_fixed.mrc";
unlink $outfile;
open OUT, ">>:utf8", $outfile or die "Can't open outfile!";
my $count = 0;
my $found = 0;
while (<RAW>) {
  $count++;
  next if $count < $start;
  print "Checking record $count\n";
  $raw = $_;
  my $pretitle;
  my $marc = MARC::Record->new_from_usmarc($raw);
  my $hrid = $marc->subfield('907', 'a');
  if ($marc->field('780') || $marc->field('785')) {
    my @pre_ids;
    foreach ($marc->field('780')) {
      my $field = $_;
      foreach ($_->subfield('w')) {
        push @pre_ids, $_;
      }
      foreach ($_->subfield('x')) {
        push @pre_ids, "(ISSN)$_";
      }
      foreach (@pre_ids) {
        # print "$_\n";
        my $match = $bib_ids->{$_};
        if ($match) {
          print "RECORD FOUND ($_ -> $match)\n";
          $pretitle = $field->as_string('atgwxzor'); 
          print "$hrid $pretitle\n";
        }
      }
    }
  }
  
  # print OUT $marc->as_usmarc();
}