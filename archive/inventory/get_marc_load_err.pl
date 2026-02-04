#! /usr/bin/perl

use MARC::Record;
use Data::Dumper;
use JSON;

binmode STDOUT, ":utf8";

my $infile = shift;
my $keyfile = shift or die "Usage: ./get_marc_load_err.pl <raw_marc_file> <key_file>\n";
if (! -e $infile) {
  die "Can't find input file!\n"
}
$/ = '';
open IDMAP, $keyfile or die "Can't open key map!";
my $ids = decode_json(<IDMAP>);

$/ = "\x1D";
open RAW, "<:encoding(UTF-8)", $infile;
$outfile = $infile;
$outfile =~ s/(.+)\.\w+$/$1/;
open OUT, ">:utf8", "${outfile}_err.mrc" or die "Can't open outfile!";
while (<RAW>) {
  $raw = $_;
  my $marc = MARC::Record->new_from_usmarc($raw);
  my $bnum = $marc->subfield('907',"a");
  unless ($ids->{$bnum}) {
    print OUT $marc->as_usmarc;
  }
}