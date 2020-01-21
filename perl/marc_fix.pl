#! /usr/bin/perl

use MARC::Record;
use Data::Dumper;
use JSON;

binmode STDOUT, ":utf8";

my $infile = shift or die "Usage: ./marc_inst_diff.pl <raw_marc_file>\n";
if (! -e $infile) {
  die "Can't find marc file!\n"
}

$/ = "\x1D";
open RAW, "<:encoding(UTF-8)", $infile;
$outfile = $infile;
$outfile =~ s/(.+)\.\w+$/$1/;
$outfile = "${outfile}_fixed.mrc";
unlink $outfile;
open OUT, ">>:utf8", $outfile or die "Can't open outfile!";
while (<RAW>) {
  $raw = $_;
  my $marc = MARC::Record->new_from_usmarc($raw);
  foreach ($marc->field('020')) {
    print "----------------\n";
    my $f = $_;
    @suba = $f->subfield('a');
    $alen = @suba;
    print "$alen\n";
  }
  # print OUT $marc->as_usmarc();
}