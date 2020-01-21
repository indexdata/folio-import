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
    my $f = $_;
    my $fc = 0;
    foreach ($f->subfield('a')) {
      $data = $_;
      if ($fc > 0) {
        my $field = MARC::Field->new('020', ' ', ' ', 'a' => $data);
        $marc->insert_fields_after($f, $field);
        $f->delete_subfield(code => 'a', pos => 1);
      }
      $fc++;
    } 
  }
  print $marc->as_formatted();
  print "\n";
  # print OUT $marc->as_usmarc();
}