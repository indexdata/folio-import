#! /usr/bin/perl

use MARC::Record;
use Data::Dumper;
use JSON;

binmode STDOUT, ":utf8";

my $infile = shift;
my $keyfile = shift or die "Usage: ./marc_inst_diff.pl <raw_marc_file> <inst_file>\n";
if (! -e $infile) {
  die "Can't find marc file!\n"
}
$/ = '';
open INST, $keyfile or die "Can't open instance file!";
my $inst = decode_json(<INST>);
my $ids = {};

foreach ( @{$inst->{instances}} ) {
  my $hrid = $_->{hrid};
  $ids->{$hrid} = 1;
}

$/ = "\x1D";
open RAW, "<:encoding(UTF-8)", $infile;
$outfile = $infile;
$outfile =~ s/(.+)\.\w+$/$1/;
$outfile = "${outfile}_not_loaded.mrc";
unlink $outfile;
open OUT, ">>:utf8", $outfile or die "Can't open outfile!";
while (<RAW>) {
  $raw = $_;
  my $marc = MARC::Record->new_from_usmarc($raw);
  my $bnum = $marc->subfield('907',"a");
  unless ($ids->{$bnum}) {
    print Dumper("--------------");
    foreach ($marc->field('020')) {
      my $f = $_;
      foreach ($f->subfields('a')) {
        print Dumper($_);
      }
    }
    print OUT $marc->as_usmarc();
  }
}