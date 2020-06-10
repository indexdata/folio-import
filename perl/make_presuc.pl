#! /usr/bin/perl

use JSON;
use MARC::Record;
use File::Basename;
use Data::Dumper;

binmode STDOUT, ":utf8";

my $infile = shift or die "Usage: ./make_presuc.pl <raw_marc_file> [<start>]\n";
if (! -e $infile) {
  die "Can't find marc file!\n"
}

my $path = dirname($infile);

my $start = shift || 1;

$bibids = "$path/bib_ids.txt";
open BID, $bibids or die "Can't open bib id file at '$bibids'.  HINT: Run index_ids.pl";
my $bib_ids = {};
print "Loading IDs map...\n";
while (<BID>) {
  chomp;
  my @b = split(/\|/);
  $bib_ids->{$b[0]} = $b[1];
}

my $i2hfile = "$path/inst2holdingsMap.json";
$/ = '';
open INST, $i2hfile or die "Can't open $i2hfile!";
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
print "Looking for matches...\n";
my $out = { precedingSucceedingTitles => [] };
while (<RAW>) {
  $count++;
  next if $count < $start;
  # print "Checking record $count\n";
  $raw = $_;
  my $marc = MARC::Record->new_from_usmarc($raw);
  my $hrid = $marc->subfield('907', 'a');
  $hrid =~ s/^\.(b\d{7}).*/$1/;
  if ($marc->field('780')) {
    foreach ($marc->field('780')) {
      my $psObj = {};
      my @pre_ids;
      my $field = $_;
      my $pretitle = $field->as_string('tg');
      $psObj->{title} = $pretitle;
      my $suc_inst_id = $hrid2inst->{$hrid};
      $psObj->{succeedingInstanceId} = $suc_inst_id;
      $psObj->{identifiers} = [];
      foreach my $sn ($field->subfield('x')) {
        my $identObj = { value => $sn, identifierTypeId => '913300b2-03ed-469a-8179-c1092c991227' };
        push @{ $psObj->{identifiers} }, $identObj;
      }
      foreach my $bn ($field->subfield('z')) {
        my $identObj = { value => $bn, identifierTypeId => '8261054f-be78-422d-bd51-4ed9f33c3422' };
        push @{ $psObj->{identifiers} }, $identObj;
      }
      foreach ($_->subfield('w')) {
        push @pre_ids, $_;
      }
      foreach ($_->subfield('x')) {
        push @pre_ids, "(ISSN)$_";
      }
      my $in_cat = 0;
      foreach (@pre_ids) {
        my $match = $bib_ids->{$_};
        $match =~ s/^\.(b\d{7}).*/$1/;
        next if $match eq $hrid;
        if ($match) {
          $found++;
          print "$found matches found (preceding $match --> $_ --> succeeding $hrid)\n";
          my $pre_inst_id = $hrid2inst->{$match};
          $psObj->{hrid} = $hrid;
          $psObj->{precedingInstanceId} = $pre_inst_id;
          push @{ $out->{precedingSucceedingTitles} }, $psObj;
          $in_cat = 1;
          last;
        }
      }
      if (!$in_cat) {
        push @{ $out->{precedingSucceedingTitles} }, $psObj;
      }
    }
  }
  if ($marc->field('785')) {
    foreach ($marc->field('785')) {
      next if $linked->{$hrid};
      my $psObj = {};
      my $field = $_;
      my $suctitle = $field->as_string('atg');
      $psObj->{title} = $suctitle;
      my $pre_inst_id = $hrid2inst->{$hrid};
      $psObj->{precedingInstanceId} = $pre_inst_id;
      $psObj->{identifiers} = [];
      foreach my $sn ($field->subfield('x')) {
        my $identObj = { value => $sn, identifierTypeId => '913300b2-03ed-469a-8179-c1092c991227' };
        push @{ $psObj->{identifiers} }, $identObj;
      }
      foreach my $bn ($field->subfield('z')) {
        my $identObj = { value => $bn, identifierTypeId => '8261054f-be78-422d-bd51-4ed9f33c3422' };
        push @{ $psObj->{identifiers} }, $identObj;
      }
      push @{ $out->{precedingSucceedingTitles} }, $psObj;
    }
  }
  # last if $found >= 10;
}

# Dedupe preceding titles
my $dedupe = {};
my $fake_id = 0;
foreach (@{ $out->{precedingSucceedingTitles} }) {
  $fake_id++;
  my $pre_id = $_->{precedingInstanceId};
  if ($pre_id) {
    if (!$dedupe->{$pre_id} || ($dedupe->{$pre_id} && $_->{succeedingInstanceId})) {
      $dedupe->{$pre_id} = $_;
    }
  } else {
    $dedupe->{$fake_id} = $_;
  }
}
$out = { precedingSucceedingTitles => [] };
foreach (keys %{ $dedupe }) {
  push @{ $out->{precedingSucceedingTitles} }, $dedupe->{$_};
}
$dedup = {};

my $json_out = to_json($out, {utf8 => 1, pretty => 1});
my $out_file = "$path/presuc.json";
print "Writing $found records to $out_file\n";
open OUT, ">:encoding(UTF-8)", $out_file or die "Can't open $out_file for writing";
print OUT $json_out;
close OUT;

# print $json_out;