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

use JSON;
use UUID::Tiny ':std';
use Time::Piece;
use File::Basename;
use Data::Dumper;

my $version = '1';
my $isil = 'CoU';

binmode STDOUT, ":utf8";

my $ref_dir = shift;
my $map_file = shift;
if (! $ARGV[0]) {
  die "Usage: ./holdings-cub.pl <ref_data_dir> <instances_tsv_map_file> <iii_holdings_jsonl_file>\n";
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

my $json = JSON->new;
$json->canonical();

my $start = time();
my @lt = localtime();
my $mdate = sprintf("%04d-%02d-%02dT%02d:%02d:%02d-0500", $lt[5] + 1900, $lt[4] + 1, $lt[3], $lt[2], $lt[1], $lt[0]);

sub uuid {
  my $text = shift;
  my $uuid = create_uuid_as_string(UUID_V5, $text . $isil . $version);
  return $uuid;
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

my $inst_map = {};
print "Opening map file-- this may take a while...\n";
open MAP, $map_file;
my $mi = 0;
while (<MAP>) {
  $mi++;
  print "  $mi map lines read\n" if $mi % 1000000 == 0;
  chomp;
  my @d = split(/\|/, $_, 2);
  $inst_map->{$d[0]} = $d[1];
}
close MAP;

$ref_dir =~ s/\/$//;
my $refdata = getRefData($ref_dir);
my $tofolio = makeMapFromTsv($ref_dir, $refdata);

# foreach (sort keys %{ $tofolio->{mtypes} }) {
  # print "$_\n" unless $tofolio->{mtypes}->{$_};
# }
# exit;

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
  my $dir = dirname($map_file);
  my $fn = basename($map_file, '.map');

  my $outfile = "$dir/${fn}_iii_holdings.jsonl";
  unlink $outfile;
  open my $OUT, ">>", $outfile;

  # my $itemfile = "$dir/${fn}_iii_holdings_items.jsonl";
  # unlink $itemfile;
  # open my $IOUT, ">>", $itemfile;

  my $count = 0;
  my $hcount = 0;
  my $errcount = 0;
  my $start = time();
 
  open IN, $infile;

  my $seen = {};
  while (<IN>) { 
    chomp;
    my $obj = $json->decode($_);
    my $iii_bid = $obj->{bibIds}->[0] || next;
    my $bid = "b$iii_bid";
    my $psv = $inst_map->{$bid} || next;
    my @b = split(/\|/, $psv);

    my $vf = {};
    foreach my $f (@{ $obj->{varFields} }) {
      my $t = $f->{marcTag};
      my $ft = $f->{fieldTag};
      if ($t && $t gt '009') {
        my $subs = {};
        foreach my $sf (@{ $f->{subfields} }) {
          my $c = $sf->{tag};
          $subs->{$c} = $sf->{content};
        }
        push @{ $vf->{$t} }, $subs;
      } elsif ($ft) {
        push @{ $vf->{$ft} }, $f->{content};
      }
    }
    my $ff = $obj->{fixedFields};
    my $h = {};
    my $hid = "c" . $obj->{id};
    next if $seen->{$hid};
    $seen->{$hid} = 1;
    my $loc_code = $ff->{40}->{value} || 'xxxxx';
    $loc_code =~ s/\s*$//;
    my $hkey = "$bid-$loc_code";
    $h->{id} = uuid($hkey);
    $h->{hrid} = $hkey;
    $h->{instanceId} = $b[0];
    my $loc_id = $refdata->{locations}->{$loc_code} || $refdata->{locations}->{UNMAPPED};
    $h->{permanentLocationId} = $loc_id;
    # $h->{holdingsTypeId} = $b[3];
    my $cn = $vf->{'090'}->[0]->{a} || '';
    if ($cn) {
      $h->{callNumberTypeId} = '95467209-6d7b-468b-94df-0f5d7ad2747d' # LC
    } else {
      $cn = $b[1];
      $h->{callNumberTypeId} = '6caca63e-5651-4db6-9247-3205156e9699' if $cn; # other
    }
    $h->{callNumber} = $cn if $cn;
    $h->{discoverySuppress} = ($ff->{118}->{value} ne '-') ? JSON::true : JSON::false ;
    foreach my $t ('n', 'z') {
      foreach (@{ $vf->{$t} }) {
        push @{ $h->{notes} }, make_notes($t, $_);
      }
    }

    my $hs = statement($obj);
    foreach my $t ('866', '867', '868') {
      my $htype = 'holdingsStatements';
      if ($t eq '867') {
        $htype = 'holdingsStatementsForSupplements';
      } elsif ($t eq '868') {
        $htype = 'holdingsStatementsForIndexes';
      }
      foreach my $f (@{ $hs->{$t}}) {
        push @{ $h->{$htype} }, make_statement($f->{text}, $f->{note});
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
          push @{ $h->{$htype} }, make_statment($text, $note);
        }
      }
    }
    
    my $hr = $json->encode($h);
    write_objects($OUT, $hr . "\n");

    # make dummy items
    # my $itm = {};
    # $itm->{holdingsRecordId} = $h->{id};
    # $itm->{hrid} = $h->{hrid} . 'item';
    # $itm->{id} = uuid($itm->{hrid});
    # $itm->{materialTypeId} = '392bc101-5ec1-46bc-9f1a-7bfa899ce67d'; # other
    # $itm->{permanentLoanTypeId} = 'aecb53e1-46ec-40db-b268-a90b7e76cd16'; # non circulating
    # $itm->{status}->{name} = 'Restricted';
    # my $ir = $json->encode($itm);
    # write_objects($IOUT, $ir . "\n");

    $count++;
    $ttl++;
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
        foreach (sort keys %{ $enum }) {
          my $c = $_;
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
              push @enumparts, $pat->{$_} . $splits->{$_}[$el];
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
          } 
        }
        my $statement = join ' - ', @parts;
        my $snote = $enum->{x} || '';
        my $note = $enum->{z} || '';
        my $otag = ($etag == 863) ? '866' : ($etag == 864) ? '867' : '868';
        push @{ $out->{$otag} }, { text=>$statement, staffnote=>$snote, note=>$note };
      }
    }
  }
  foreach my $stag ('866', '867', '868') {
    foreach (@{ $field->{$stag} }) {
      $out->{$stag} = [];
      my $snote = $_->{x} || '';
      my $note = $_->{z} || '';
      my $text = $_->{a} || '';
      push @{ $out->{$stag} }, { text=>$text, staffnote=>$snote, note=>$note };
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
