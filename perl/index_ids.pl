#! /usr/bin/perl

use MARC::Record;
use Data::Dumper;
use JSON;

binmode STDOUT, ":utf8";

my $infile = shift or die "Usage: ./index_ids.pl <raw_marc_file> [ <control_field> ]\n";
if (! -e $infile) {
  die "Can't find marc file!\n"
}
my $ctrl = shift || '001';

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
  $raw = $_;
  my $pretitle;
  my $marc = MARC::Record->new_from_usmarc($raw);
  my $hrid;
  if ($ctrl =~ /^00/) {
    my $f = $marc->field($ctrl);
    $hrid = $f->data();
  } else {
    $ctrl =~ /(...)(.)/;
    $hrid = $marc->subfield($1, $2);
  }

  foreach my $cf ($marc->field('035')) {
    foreach ($cf->subfield('a')) {
      print "$_|$hrid\n";
    }
  }
  
  foreach my $lc ($marc->field('010')) {
    foreach ($lc->subfield('a')) {
      s/^(\d{8})$/$1 /;
      my $num = sprintf('%12s', $_);
      print "(DLC)$num|$hrid\n";
    }
  }
  
  foreach my $sn ($marc->field('022')) {
    foreach ($sn->subfield('a')) {
      print "(ISSN)$_|$hrid\n";
    }
  }
  
  # print OUT $marc->as_usmarc();
}