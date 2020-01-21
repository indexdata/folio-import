#! /usr/bin/perl

use MARC::Record;
use Data::Dumper;
use JSON;

binmode STDOUT, ":utf8";

my $infile = shift;
my $keyfile = shift or die "Usage: ./marc_inst_diff.pl <raw_marc_file> <inst_file> [<record_number_field>]";
my $field = shift || '001';
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
my $num = 0;
while (<RAW>) {
  $num++;
  $raw = $_;
  my $marc = MARC::Record->new_from_usmarc($raw);
  my $cnum;
  if ($field =~ /^00/) {
    $cnum = $marc->field($field)->as_string();
  } else {
    $field =~ /^(...)(.)/;
    $cnum = $marc->subfield($1, $2);
  }
  unless ($ids->{$cnum}) {
    print "Rec # $num ($cnum) not found\n";
    print OUT $marc->as_usmarc();
  }
}