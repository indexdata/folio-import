#!/usr/bin/perl
binmode(STDOUT, ":utf8");

my $m = shift or die "Usage: ./mtag_find.pl <tag> <raw_marc_file> [<limit>]\n";
open IN, "<:encoding(utf-8)", shift or die "Can't find raw Marc file!\n";
my $lim = shift || 1000000;
$/ = "\x1D";
$i = 0;
while (<IN>) {
  my $rec = $_;
  last if $i == $lim;
  my $len = substr($_, 12, 5);
  $len =~ s/^0*//;
  $len -= 24;
  my $dir = substr($_, 24, $len);
  my @t = $dir =~ /(\d{3})\d{9}/g;
  foreach (@t) {
	if ($_ eq $m) {
		print $rec;
		last;
	}
  }
  $i++;
}
