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
my $outfile = $infile;
$outfile =~ s/(.+)\.\w+$/$1/;
$outfile = "${outfile}_fixed.mrc";
unlink $outfile;
open OUT, ">>:utf8", $outfile or die "Can't open outfile!";

my $errfile = $infile;
$errfile =~ s/(.+)\.\w+$/$1/;
$errfile = "${errfile}_err.mrc";
unlink $errfile;
my $seen = {};

my $count = 0;
while (<RAW>) {
  my $err = 0;
  $count++;
  print "$count\n";
  $raw = $_;
  my $org = '';
  my $marc;
  my $ofield;
  my $ok = eval {
    $marc = MARC::Record->new_from_usmarc($raw);
    $ofield = ($marc->field('035'))[0];
    1;
  };
  if ($ok) {
    if ($ofield) {
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
        }
        $marc->delete_fields($marc->field('001'));
      }
      if (!$seen->{$ctrl}) {
        my $new_cf = MARC::Field->new('001', $ctrl);
        $marc->insert_fields_ordered($new_cf);
      }
      $seen->{$ctrl} = 1;
    }
    if (!$marc->field('001')) {
      open ERR, ">>:utf8", $errfile or die "Can't open errfile!";
      print ERR $marc->as_usmarc();
      close ERR;
    }
    # print $marc->as_formatted();
    print OUT $marc->as_usmarc();
  }
}