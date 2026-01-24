#! /usr/bin/perl

# This script will take the text (default) output of yaz-marcdump and create an updated raw marc file of it.

use MARC::Record;
use Data::Dumper;

binmode STDOUT, ":utf8";

my $infile = shift or die "Usage: ./marc_save.pl <yaz-marcdump_text_file>\n";
if (! -e $infile) {
  die "Can't find marc file!\n"
}

open TXT, "<:encoding(UTF-8)", $infile;
$outfile = $infile;
$outfile =~ s/(.+)\.\w+$/$1/;
$outfile = "${outfile}_updated.mrc";
unlink $outfile;
open OUT, ">>:utf8", $outfile or die "Can't open outfile!";
my $count = 0;
my $marc = MARC::Record->new();
while (<TXT>) {
  chomp;
  $count++;
  if (/^\d{5}/) {
    $marc->leader($_);
  } elsif (/^(00\d) (.+)/) {
    my $field = MARC::Field->new($1, $2);
    $marc->insert_fields_ordered($field);
  } elsif (/^(\w{3}) (.)(.) (.+)/) {
    my $data = $4;
    my @subs;
    while ($data =~ s/\$(.) ([^\$]+)//) {
      push @subs, $1, $2;
    }
    my $field =  MARC::Field->new($1, $2, $3, @subs); 
    $marc->insert_fields_ordered($field);
  }
}
# print $marc->as_formatted();
print OUT $marc->as_usmarc();
print "Marc binary saved as $outfile\n";