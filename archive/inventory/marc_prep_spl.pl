#! /usr/bin/perl

use MARC::Record;
use Data::Dumper;
use JSON;

binmode STDOUT, ":utf8";

my $infile = shift or die "Usage: ./marc_ctrl_fix.pl <raw_marc_file>\n";
if (! -e $infile) {
  die "Can't find marc file!\n"
}

my $locmap = {
  # dt => "4a928175-1456-4cb4-b60e-36386ac0ff9c",
  ou => "9d6bdafd-d70a-470e-a76e-490312665432",
  elec => "6bf60302-5ad5-4002-9755-84c0043ec07c",
  mail => "fcd976a0-5114-4676-a73f-42fbb63335c8",
  ill => "735a60af-f702-4d05-97fa-7d0a242a0983",
  hy => "60902c62-ae49-4668-965e-fe5acd43da23",
  pl => "0d8bcede-ef17-4a3f-93fa-50a37e83b0bf",
  dt => "0d8bcede-ef17-4a3f-93fa-50a37e83b0bf",
  # wc => "b0a69eda-dea6-4d6c-8ee7-321531171dc4",
  # so => "445853d2-d20d-4973-9fa5-54fdfdb9466c",
  sh => "8ee1c82a-828e-40e5-a26d-c3bc88d4a25e",
  it => "8ee1c82a-828e-40e5-a26d-c3bc88d4a25e",
  wc => "8ee1c82a-828e-40e5-a26d-c3bc88d4a25e",
  spsshaw => "16832d9c-6a55-4e08-a002-1d64c6e7d4f8",
  ss => "b35a974a-06ce-49fd-897b-4c970fdd72d3",
  lp => "61e95485-8ea3-4792-a09f-aa7441210109",
  so => "61e95485-8ea3-4792-a09f-aa7441210109",
  es => "61e95485-8ea3-4792-a09f-aa7441210109",
  #it => "9077ba27-83bf-4854-9322-cc0ccf6eaaed",
  spl-bo => "e339f248-2289-4418-bb24-bf38fa837588",
  on => "af52afd9-55ad-4f99-baeb-a8aaef1c236e",
  os => "b6e72323-3ca3-4ab7-abb4-d28aaf57db2a",
  # es => "91c54a1c-4f0a-472d-b2ae-39b1282d926b",
  nt => "a8c1ccfb-d4f5-48cc-aaa9-f607a29288ca",
  spsglov => "4109ce59-4ff8-4c99-8918-8e9aec9d732d"
};

$/ = '';

my $colmap = {};
my $colfile = $infile;
$colfile =~ s/(.+)\/.*/$1\/collections.json/;
if (-e $colfile) {
  open COLL, $colfile or print "WARN Can't open collections.json file!\n";
  my $colls = decode_json(<COLL>);
  foreach (@{ $colls->{mtypes} }) {
    my $code = $_->{code};
    my $id = $_->{id};
    $colmap->{$code} = $id;
  }
}

$/ = "\x1D";
open RAW, "<:encoding(UTF-8)", $infile;

my $outfile = $infile;
$outfile =~ s/(.+)\.\w+$/$1/;
$outfile = "${outfile}_fixed.mrc";
unlink $outfile;
open OUT, ">>:utf8", $outfile or die "Can't open outfile!";

my $itemfile = $infile;
$itemfile =~ s/(.+)\.\w+$/$1/;
$itemfile = "${itemfile}_items.tsv";
unlink $itemfile;
open ITMS, ">>:utf8", $itemfile or die "Can't open outfile!";

my $errfile = $infile;
$errfile =~ s/(.+)\.\w+$/$1/;
$errfile = "${errfile}_err.mrc";
unlink $errfile;
my $seen = {};

my $count = 0;
while (<RAW>) {
  my $err = 0;
  $count++;
  print "Processed $count\n" if $count % 1000 == 0;
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
    if ($marc->field('000')) {
      my $z = $marc->field('000');
      my $ldr = $z->data();
      $marc->leader($ldr);
      $marc->delete_fields($z);
    }
    if (!$marc->field('008')) {
      my $e = "220101s2022    xxxa   j      000 0beng  ";
      my $f = MARC::Field->new('008', $e);
      $marc->insert_fields_ordered($f);
    }
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
    foreach ($marc->field('949')) {
      my $iid = $_->subfield('q');
      my $bc = $_->subfield('b');
      my $mt = $_->subfield('c');
      my $lo = $_->subfield('g');
      my $cn = $_->subfield('e');
      my $locid;
      my $matid;
      if ($lo) {
        $locid = $locmap->{$lo} || $lo;
        $_->update(g => $locid);
      }
      if ($mt) {
        $matid = $colmap->{$mt} || 'eb9436f3-2302-468f-b0b9-e133983307a5';
        $_->update(c => $matid);
      }
      print ITMS "$iid\t$bc\t$lo\t$locid\t$cn\t$mt\t$matid\n" if $iid;
    }
    # print $marc->as_formatted();
    print OUT $marc->as_usmarc();
  }
}