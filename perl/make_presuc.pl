#! /usr/bin/perl

use MARC::Record;
use Data::Dumper;
use JSON;

binmode STDOUT, ":utf8";

my $infile = shift or die "Usage: ./make_presuc.pl <raw_marc_file> [<start>]\n";
if (! -e $infile) {
  die "Can't find marc file!\n"
}

my $start = shift || 1;

my $bibids = $infile;
$bibids =~ s/^(.+)\/.*/$1\/bib_ids.txt/;
open BID, $bibids or die "Can't open bib id file at '$bibids'";
my $bib_ids = {};
print "Loading IDs map...\n";
while (<BID>) {
  chomp;
  my @b = split(/\|/);
  $bib_ids->{$b[0]} = $b[1];
}


my $file = $infile;
$file =~ s/^(.+)\/.*/$1\/inst2holdingsMap.json/;
$/ = '';
open INST, $file or die "Can't open $file!";
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
  if ($marc->field('780')) {
    my $psObj = {};
    my @pre_ids;
    my $done = 0;
    foreach ($marc->field('780')) {
      my $field = $_;
      foreach ($_->subfield('w')) {
        push @pre_ids, $_;
      }
      foreach ($_->subfield('x')) {
        push @pre_ids, "(ISSN)$_";
      }
      foreach (@pre_ids) {
        my $match = $bib_ids->{$_};
        next if $match eq $hrid;
        $match =~ s/^\.(b\d{7}).*/$1/;
        $hrid =~ s/^\.(b\d{7}).*/$1/;
        if ($match) {
          print "$hrid\n";
          print "$_\n";
          $found++;
          my $inst_id = $hrid2inst->{$match};
          # print "[$found] RECORD FOUND ($_ -> $match -> $inst_id)\n";
          my $pretitle = $field->as_string('atg');
          $psObj->{title} = $pretitle;
          $psObj->{hrid} = $hrid;
          $psObj->{precedingInstanceId} = $inst_id;
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
          # print "$hrid $pretitle\n";
          $done = 1;
        }
        last if $done;
      }
      next if $done;
    }
  }
  last if $found >= 10;
}

print to_json($out, {utf8 => 1, pretty => 1});