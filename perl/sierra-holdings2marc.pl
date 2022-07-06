#! /usr/bin/perl

# Create FOLIO holdings records from the Sierra item API objects 
#
# Run the following script to get fresh data
#   reference_inventory.sh
#
# You must first create an okapi session by running login.sh to use the above scripts.
#
# To add metadata, set FOLIO_USER_ID to user UUID (e.g. export FOLIO_USER_ID=b8e68b41-5473-5d0c-85c8-f4c4eb391b59)

use strict;
use warnings;

use MARC::Record;
use MARC::Record::MIJ;
use JSON;
use UUID::Tiny ':std';
use Time::Piece;
use File::Basename;
use Data::Dumper;

binmode STDOUT, ":utf8";

if (! $ARGV[0]) {
  die "Usage: ./sierra-holdings2marc.pl  <iii_holdings_jsonl_file>\n";
}

my $months = {
  '01' => 'Jan.',
  '02' => 'Feb.',
  '03' => 'Mar.',
  '04' => "Apr.",
  '05' => 'May',
  '06' => 'Jun.',
  '07' => 'Jul.',
  '08' => 'Aug.',
  '09' => 'Sep.',
  '10' => 'Oct.',
  '11' => 'Nov.',
  '12' => 'Dec.',
  '21' => 'Spring',
  '22' => 'Summer',
  '23' => 'Autumn',
  '24' => 'Winter'
};

my $json = JSON->new();
$json->canonical();

my $start = time();
my @lt = localtime();
my $mdate = sprintf("%04d-%02d-%02dT%02d:%02d:%02d-0500", $lt[5] + 1900, $lt[4] + 1, $lt[3], $lt[2], $lt[1], $lt[0]);

sub uuid {
  my $text = shift;
  my $uuid = create_uuid_as_string(UUID_V5, $text);
  return $uuid
}

sub getRefData {
  my $refdir = shift;
  my $refobj = {};
  local $/ = '';
  foreach (<$refdir/*.json>) {
    my $prop = $_;
    $prop =~ s/^(.+\/)?(.+?)\.json/$2/;
    open my $refdata, $_ or die "Can't open $_";
    my $jsonstr = <$refdata>;
    my $json = eval { decode_json($jsonstr) };
    if ($@) {
      print "WARN $_ is not valid JSON!\n";
    } else {
      foreach (keys %$json) {
        if ($_ ne 'totalRecords') {
          my $refroot = $_;
          $refobj->{$refroot} = {};
          foreach (@{ $json->{$_} }) {
            my $name;
            if ($refroot =~ /^(instanceTypes|contributorTypes|instanceFormats|locations)$/) {
              $name = $_->{code};
            } else {
              $name = $_->{name};
            }
            if ($refroot eq 'locations') {
              $name =~ s/^.+\///;
            }
            my $id = $_->{id};
            $refobj->{$refroot}->{$name} = $id;
          }
        }
      }
    }
  }
 return $refobj;
}

sub makeMapFromTsv {
  my $refdir = shift;
  my $refdata = shift;
  my $tsvmap = {};
  foreach (<$refdir/*.tsv>) {
    my $prop = $_;
    $prop =~ s/^(.+\/)?(.+?)\.tsv/$2/;
    open my $tsv, $_ or die "Can't open $_";
    my $l = 0;
    while (<$tsv>) {
      $l++;
      next if $l == 1;
      chomp;
      s/\s+$//;
      my @col = split(/\t/);
      my $code = $col[0];
      my $name = $col[2] || '';
      if ($prop eq 'statuses') {
        $tsvmap->{$prop}->{$code} = $name;
      } else {
        if ($prop eq 'locations') {
          $name = $col[1];
          $name =~ s/^.+\///;
        }
        $tsvmap->{$prop}->{$code} = $refdata->{$prop}->{$name};
      }
    }
  }
 return $tsvmap;
}

my $relations = {
  '0' => 'Resource',
  '1' => 'Version of resource',
  '2' => 'Related resource',
  '3' => 'No information provided'
};

my $ttl = 0;

foreach (@ARGV) {
  my $infile = $_;
  if (! -e $infile) {
    die "Can't find Sierra holdings file!";
  } 
  my $dir = dirname($infile);
  my $fn = basename($infile, '.jsonl');

  my $outfile = "$dir/${fn}.mrc";
  unlink $outfile;
  open my $OUT, ">>:encoding(UTF-8)", $outfile;

  my $count = 0;
  my $start = time();
 
  open IN, '<:encoding(UTF-8)', $infile;

  my $seen = {};
  while (<IN>) { 
    chomp;
    my $obj;
    eval { $obj = $json->decode($_) };
    if ($obj) {
      my $iii_bid = $obj->{bibIds}->[0];
      my $bid = "b$iii_bid";
      print "$bid\n";

      my $vf = {};
      my $marc = MARC::Record->new();
      my $f001 = MARC::Field->new('001', $obj->{id});
      $marc->insert_fields_ordered($f001); 
      my $f004 = MARC::Field->new('004', $bid);
      $marc->insert_fields_ordered($f004);
      my $updated = $obj->{fixedFields}->{84}->{value};
      $updated =~ s/[-TZ:]//g;
      my $f005 = MARC::Field->new('005', "$updated.0");
      $marc->insert_fields_ordered($f005);
      foreach my $f (@{ $obj->{varFields} }) {
        my $t = $f->{marcTag} ;
        my $ft = $f->{fieldTag};
        if ($t && $t gt '009') {
          my $subs = {};
          my @msubs;
          foreach my $sf (@{ $f->{subfields} }) {
            my $c = $sf->{tag};
            $subs->{$c} = $sf->{content};
            push @msubs, $sf->{tag}, $sf->{content};
          }
          push @{ $vf->{$t} }, $subs;
          my $field = MARC::Field->new($t, $f->{ind1}, $f->{ind2}, @msubs);
          $marc->insert_fields_ordered($field);
        } elsif ($t && $t lt '010') {
          my $field = MARC::Field->new($t, $f->{content});
          $marc->insert_fields_ordered($field); 
        } elsif ($ft) {
          push @{ $vf->{$ft} }, $f->{content};
          if ($ft eq '_') {
            $marc->leader($f->{content});
          } else {
            my $field = MARC::Field->new('500', ' ', ' ', 'a' => $f->{content});
            $marc->insert_fields_ordered($field); 
          }
        }
      }
      print $marc->as_formatted();

      my $hid = "c" . $obj->{id};
      next if $seen->{$hid};

      my $ff = $obj->{fixedFields};
      $seen->{$hid} = 1;
      my $loc_code = $ff->{40}->{value} || 'xxxxx';
      $loc_code =~ s/\s*$//;
      my $cn = $vf->{'090'}->[0]->{a} || '';

      my $hs = statement($obj);
      foreach my $t ('866', '867', '868') {
        my $htype = 'holdingsStatements';
        if ($t eq '867') {
          $htype = 'holdingsStatementsForSupplements';
        } elsif ($t eq '868') {
          $htype = 'holdingsStatementsForIndexes';
        }
        foreach my $f (@{ $hs->{$t}}) {
          my $st = make_statement($f->{text}, $f->{note});
        }
      }

      if (0) {
        foreach my $t ('863', '864', '865') {
          foreach my $f (@{ $vf->{$t} }) {
            my @data;
            my @notes;
            for my $s ('a' .. 'z') {
              if ($f->{$s}) {
                if ($s =~ /[mnz]/) {
                  push @notes, $f->{$s};
                } else {
                  push @data, $f->{$s};
                }
              }
            }
            my $text = join ', ', @data;
            my $note = join ', ', @notes;
            my $htype = 'holdingsStatements';
            if ($t eq '864') {
              $htype = 'holdingsStatementsForSupplements';
            } elsif ($t eq '865') {
              $htype = 'holdingsStatementsForIndexes';
            }
            my $st, make_statment($text, $note);
          }
        }
      }
      
      # my $hr = $json->encode($h);
      # write_objects($OUT, $hr . "\n");

      $count++;
      $ttl++;
    }
  } 
  close IN;
}
my $end = time;
my $secs = $end - $start;
print "\n$ttl Sierra holdings processed in $secs secs.\n\n";

sub statement {
  my $h = shift;
  my $field = parse($h);
  my $out = {
    '866' => [],
    '867' => [],
    '868' => []
  };
  foreach (863, 864, 865) {
    my $etag = $_;
    my $ptag = $etag - 10;
    foreach (keys %{ $field->{$etag} }) {
      my $link = $_;
      my $pat = $field->{$ptag}->{$link}[0];
      foreach (@{ $field->{$etag}->{$link} }) {
        my $enum = $_;
        my $splits = {};
        my @codes;
        my $open = 0;
        foreach (sort keys %{ $enum }) {
          my $c = $_;
          if ($enum->{$c} =~ /-$/) { 
            $open = 1;
          }
          if ($c =~ /^[a-m]$/ && $enum->{$c}) {
            push @codes, $c;
            @{ $splits->{$c} } = split(/-/, $enum->{$c});
          }
        }
        my @parts;
        my $preyear;
        foreach (0, 1) {
          my $el = $_;
          my @enumparts;
          my @cronparts;
          foreach (@codes) {
            if (!$splits->{$_}[$el]) {
              next;
            }
            if (/[a-h]/) {
              my $suf = $pat->{$_} || '';
              if ($suf =~ /\(year\)/) {
                $suf = '';
              } elsif ($suf =~ /\(month|season\)/) {
                $suf = $months->($suf);
              }
              push @enumparts, $suf . $splits->{$_}[$el];
            } else {
              my $p = $pat->{$_};
              my $v = $splits->{$_}[$el] || $splits->{$_}[0];
              
              if ($p =~ /year/) {
                push @cronparts, $v;
                $preyear = $v;
              } elsif ($p =~ /month|season/) {
                my $m = $months->{$v} || $v;
                unshift @cronparts, $m;
              } if ($p =~ /day/) {
                if ($cronparts[0]) {
                  splice @cronparts, 1, 0, "$v,";
                } else {
                  unshift @cronparts, "$v,";
                }
              } 
            }
          }
          # check to see if the last cronpart contains a year, if not, add the year from the previous element
          if ($cronparts[0] && $cronparts[-1] !~ /\d{4}/) {
            push @cronparts, $preyear;
          }
          my $enumpart = join ':', @enumparts;
          my $cronpart = join ' ', @cronparts;
          if ($enumpart && $cronpart) {
            push @parts, "$enumpart ($cronpart)";
          } elsif ($cronpart) {
            push @parts, $cronpart;
          } elsif ($enumpart) {
            push @parts, $enumpart;
          }
        }
        my $statement = join ' - ', @parts;
        $statement .= '-' if $open;
        my $snote = $enum->{x} || '';
        my $note = $enum->{z} || '';
        my $otag = ($etag == 863) ? '866' : ($etag == 864) ? '867' : '868';
        push @{ $out->{$otag} }, { text=>$statement, staffnote=>$snote, note=>$note };
      }
    }
  }
  foreach ('866', '867', '868') {
    my $stag = $_;
    if ($field->{$stag}) {
      $out->{$stag} = [];
      foreach (keys %{ $field->{$stag} }) {
        my $k = $_;
        foreach (@{ $field->{$stag}->{$k} }) {
          my $snote = $_->{x} || '';
          my $note = $_->{z} || '';
          my $text = $_->{a} || '';
          push @{ $out->{$stag} }, { text=>$text, staffnote=>$snote, note=>$note };
        }
      }
    }
  }
  return $out;
}

sub parse {
  my $h = shift;
  my $vf = $h->{varFields};
  my $field = {};
  foreach my $v (@{ $vf }) {
    my $tag = $v->{marcTag} || '';
    if ($tag && $tag gt '009') {
      my $sub = {};
      my @ord;
      my $num;
      foreach my $s (@{ $v->{subfields} }) {
        my $code = $s->{tag};
        my $val = $s->{content};
        if ($code eq '8') {
          $num = $val;
          $num =~ s/\..+//;
        }
        $sub->{$code} = $val;
        push @ord, $code, $val;
      }
      $sub->{ind1} = $v->{ind1};
      $sub->{ind2} = $v->{ind2};
      push @{ $sub->{arr} }, @ord;
      if (!$num && $tag =~ /866|867|868/) {
        $num = 1;
      }
      if ($num) {
        push @{ $field->{$tag}->{$num} }, $sub;
      } else {
        eval { push @{ $field->{$tag} }, $sub };
      } 
    } elsif ($v->{fieldTag} eq '_') {
      $field->{leader} = $v->{content};
    }
  }
  return $field;
}

sub make_statement {
  my $text = shift;
  my $note = shift;
  my $snote = shift;
  my $s = {};
  $s->{statement} = $text;
  $s->{note} = $note if $note;
  $s->{staffNote} = $snote if $snote;
  return $s;
}

sub make_notes {
  my $type = shift;
  my $note = shift;
  my $n = { note=>$note };
  $n->{holdingsNoteTypeId} = 'b160f13a-ddba-4053-b9c4-60ec5ea45d56'; # note
  if ($type eq 'z') {
    $n->{staffOnly} = JSON::true;
  } else {
    $n->{staffOnly} = JSON::false;
  }
  return $n;
}

sub write_objects {
  my $fh = shift;
  my $recs = shift || '';
  print $fh $recs;
}

sub dedupe {
  my @out;
  my $found = {};
  foreach (@_) { 
    $found->{$_}++;
    if ($found->{$_} < 2) {
      push @out, $_;
    }
  }
  return [ @out ];
}
