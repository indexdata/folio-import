#!/usr/bin/perl

# This script will take every nth record from a marc collection and save them to a smaller collection.

my $stop = shift;
my $nth = shift;
my $marc_file = shift or die "Usage ./random_marc.pl <stop_count> <nth_record> <file> [ <start_rec> ]\n";
my $start = shift || 0;
my $out_file = $marc_file;
$out_file =~ s/(.+)\/.*/$1/;
$out_file .= "/random.mrc";
unlink($out_file);
open OUT, ">>", $out_file;

$/ = "\x1D";
open IN, $marc_file or die "Can't open $marc_file!";
my $c = 0;
my $ttl = 0;
while (<IN>) {
  next if /^00[0-5]/;
  if ($c % $nth == 0 && $c >= $start) {
    print OUT $_;
    $ttl++;
  }
  $c++;
  last if $ttl == $stop;
}
print "$ttl records saved to $out_file\n";