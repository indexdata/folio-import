#! /usr/bin/perl
use JSON;

my $tsv = shift;

if (!$tsv) {
  print "Usage: $0 <tsv_file>\n";
  exit;
}

open TSV, "<:encoding(UTF8)", $tsv or die "Can't find $tsv";

my $obj = { $type => [] };
my $i = 0;
while (<TSV>) {
  $i++;
  next if $i < 3;
  my ($name, $desc) = split /\t/;
  my $refobj = {};
  if ($desc) {
    $refobj->{name} = $desc;
  } else {
    $refobj->{name} = $name;
  }
  push @{ $obj->{departments} }, $refobj;
}
my $out = JSON->new->pretty->encode($obj);
my $outfile = $tsv;
$outfile =~ s/\.tsv$/.json/;
open OUT, ">:encoding(UTF8)", $outfile or die "Can't write to $outfile";
print OUT $out;