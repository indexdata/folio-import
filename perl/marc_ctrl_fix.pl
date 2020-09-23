#! /usr/bin/perl

use MARC::Record;
use Data::Dumper;
use JSON;

binmode STDOUT, ":utf8";

my $infile = shift or die "Usage: ./marc_ctrl_fix.pl <raw_marc_file>\n";
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
my $count = 0;
while (<RAW>) {
  $count++;
  $raw = $_;
  my $org = '';
  my $marc = MARC::Record->new_from_usmarc($raw);
  my $ofield = ($marc->field('035'))[0];
  my $ctrl = $ofield->subfield('a');
  $marc->delete_fields($ofield);
  my $one_field = $marc->field('001');
  my $three_field = $marc->field('003');
  if ($three_field) {
    $org = $three_field->data();
    $marc->delete_fields($three_field) if $three_field;
  }
  if ($one_field) {
    my $one = $one_field->data();
    $one =~ s/^oc.//;
    if ($org) {
      $one = "($org)$one";
    }
    unless ($marc->field('035')) {
      my $field = MARC::Field->new('035', ' ', ' ', a=>$one);
      $marc->insert_fields_ordered($field);
      $marc->delete_fields($one_field);
    }
  }
  my $new_cf = MARC::Field->new('001', $ctrl);
  $marc->insert_fields_ordered($new_cf);
  # print $marc->as_formatted();
  print OUT $marc->as_usmarc();
}