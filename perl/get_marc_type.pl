#! /usr/bin/perl

use MARC::File::USMARC;
use Data::Dumper;

binmode STDOUT, ":utf8";
my $infile = shift or die "Usage: ./get_marc_type.pl <raw_marc_file> <type>\n";
if (! -e $infile) {
  die "Can't find input file!\n"
}
my $mtype = shift or die "Type code is required\n";
my $file = MARC::File::USMARC->in($infile);

while (my $marc = $file->next()) {
  if ($marc->{_leader} =~ /^\d{5}.$mtype/) {
    print $marc->as_usmarc();
  }
}
$file->close();