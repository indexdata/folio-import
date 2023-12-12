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
my $isil = 'CStclU';
my $ver = '1';

my $source_id = 'f32d531e-df79-46b3-8932-cdd35f7a2264'; #MARC
my $tm = localtime;
my $id_admin = '23787404-089b-5efe-a8da-b207cbab9514';

binmode STDOUT, ":utf8";

my $ref_dir = shift;
my $map_file = shift;
if (! $ARGV[0]) {
  die "Usage: ./holdings-scu.pl <ref_data_dir> <instances_tsv_map_file> <iii_holdings_jsonl_file>\n";
}

my $months = {
  '1' => 'Jan.',
  '2' => 'Feb.',
  '3' => 'Mar.',
  '4' => "Apr.",
  '5' => 'May',
  '6' => 'Jun.',
  '7' => 'Jul.',
  '8' => 'Aug.',
  '9' => 'Sep.',
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

my $cntypes = {
  '050' => '95467209-6d7b-468b-94df-0f5d7ad2747d',
  '090' => '95467209-6d7b-468b-94df-0f5d7ad2747d',
  '099' => '6caca63e-5651-4db6-9247-3205156e9699',
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

my $loc_code_map = {};
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
      my $code = $col[0] || '';
      my $name = $col[2] || '';
      if ($prop eq 'statuses') {
        $tsvmap->{$prop}->{$code} = $name;
      } else {
        if ($prop eq 'locations') {
          $name = $col[2] || '';
          # $tsvmap->{loc_codes}->{$code} = $name;
          $loc_code_map->{$code} = $name || 'UNMAPPED';
        }
        if ($prop eq 'choldings-types') {
          $name = $col[2];
          $tsvmap->{holdingsTypes}->{$code} = $refdata->{holdingsTypes}->{$name};
        } else {
          $tsvmap->{$prop}->{$code} = $refdata->{$prop}->{$name}; 
        }
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
# print Dumper($refdata->{holdingsTypes}); exit;
my $tofolio = makeMapFromTsv($ref_dir, $refdata);
$tofolio->{locations}->{multi} = $refdata->{locations}->{multi};
# print Dumper($tofolio->{holdingsTypes}); exit;
# print Dumper($loc_code_map); exit;

my $relations = {
  '0' => 'Resource',
  '1' => 'Version of resource',
  '2' => 'Related resource',
  '3' => 'No information provided'
};

my $typemap = {
  'x' => 'Monograph',
  'y' => 'Serial',
  'v' => 'Multi-part monograph'
};

my $ttl = 0;
my $errcount = 0;

foreach (@ARGV) {
  my $infile = $_;
  if (! -e $infile) {
    die "Can't find Sierra holdings file!";
  } 
  my $dir = dirname($infile);
  my $fn = basename($infile, '.jsonl');

  my $outfile = "$dir/${fn}_holdings.jsonl";
  unlink $outfile;
  open my $OUT, ">>:encoding(UTF-8)", $outfile;

  # my $hmapfile = "$dir/holdings.map";
  # unlink $hmapfile;
  # open my $HMAP, ">>:encoding(UTF-8)", $hmapfile;

  my $count = 0;
  my $hcount = 0;
  my $start = time();
 
  open IN, $infile;

  my $seen = {};
  while (<IN>) { 
    chomp;
    my $obj = $json->decode($_);
    my $iii_bid = $obj->{bibIds}->[0];
    my $bid = "b$iii_bid";
    my $psv = $inst_map->{$bid} || '';
    my @b = split(/\|/, $psv);
    if (!$b[0]) {
      print "ERROR instanceId not found for $bid!\n";
      $errcount++;
      next;
    }

    my $vf = {};
    my $leader = '';
    my $vfcn = '';
    my $vfpre = '';
    foreach my $f (@{ $obj->{varFields} }) {
      my $t = $f->{marcTag};
      my $ft = $f->{fieldTag};
      my $ind1 = $f->{ind1};
      my $ind2 = $f->{ind2};
      if ($t && $t gt '009') {
        my $subs = { ind1 => $f->{ind1}, ind2 => $f->{ind2} };
        foreach my $sf (@{ $f->{subfields} }) {
          my $c = $sf->{tag};
          $subs->{$c} = $sf->{content};
        }
        push @{ $vf->{$t} }, $subs;
      } elsif ($ft) {
        push @{ $vf->{$ft} }, $f->{content};
        if ($ft eq '_') {
          $leader = $f->{content};
        }
      }
      if ($ft eq 'c')  {
        if ($t) {
          my @parts;
          foreach my $sf (@ {$f->{subfields}}) {
            if ($sf->{tag} eq 'f') {
              $vfpre = $sf->{content};
            } else {
              push @parts, $sf->{content};
            }
          }
          $vfcn = join ' ', @parts;
        } else {
          $vfcn = $f->{content};
        }
      }
    }
    # print Dumper($vf);
    my $stitle = $vf->{'843'}->[0]->{a} || '';

    my $ff = $obj->{fixedFields};
    my $h = {};
    my $loc_code = $ff->{40}->{value} || 'xxxxx';
    my $scode2 = $ff->{37}->{value} || '-';
    $loc_code =~ s/\s*$//;
    my $hid = "c" . $obj->{id};
    next if $seen->{$hid};
    $seen->{$hid} = 1;
    my $hkey = "$bid-$loc_code";
    $h->{id} = uuid($hid);
    # print $HMAP "$bid|$loc_code|$h->{id}|$hid|$vfcn\n";
    $h->{_version} = $ver;
    $h->{formerIds} = [ $obj->{id} ];
    $h->{hrid} = $hid;
    $h->{instanceId} = $b[0];
    my $loc_id = $tofolio->{locations}->{$loc_code};
    if (!$loc_id) {
      print "ERROR: LocationId not found for $loc_code\n";
      $errcount++;
      next;
    }
    $h->{permanentLocationId} = $loc_id;
    $h->{sourceId} = $source_id;
    my $typeid = $tofolio->{holdingsTypes}->{$scode2};
    $h->{holdingsTypeId} = $typeid;
    my $cntype = $b[2];
    my @cnparts = split /\^\^/, $b[1];
    my $cnpre = $cnparts[0] || '';
    my $cn = $cnparts[1] || '';
    if ($vfcn) {
      $cntype = '6caca63e-5651-4db6-9247-3205156e9699'; #other
      $cn = $vfcn;
      $cnpre = $vfpre;
    }
    
    $h->{callNumberPrefix} = $cnpre if $cnpre;
    $h->{callNumberTypeId} = $cntype || '6caca63e-5651-4db6-9247-3205156e9699'; #other
    $h->{callNumber} = $cn if $cn;
    $h->{discoverySuppress} = JSON::true;
    foreach my $t ('i', 'f','n','w','z') {
      foreach (@{ $vf->{$t} }) {
        push @{ $h->{notes} }, make_notes($t, $_);
      }
    }

    if ($vf->{h}) {
      foreach my $hs (@{ $vf->{h} }) {
        push @{ $h->{holdingsStatements} }, make_statement($hs)
      }
    } else {
      my $hs = statement($obj);
      foreach my $t ('866', '867', '868') {
        my $htype = 'holdingsStatements';
        if ($t eq '867') {
          $htype = 'holdingsStatementsForSupplements';
        } elsif ($t eq '868') {
          $htype = 'holdingsStatementsForIndexes';
        }
        # print Dumper($hs);
        foreach my $f (@{ $hs->{$t}}) {
          push @{ $h->{$htype} }, make_statement($f->{text}, $f->{note});
        }
      }
    }

    foreach my $e (@{ $vf->{856} }) {
      my $uri = $e->{u} || '';
      my $ltext = $e->{z} || '';
      $uri =~ s/^.+(http.+?) >.+/$1/;
      $ltext =~ s/.+>\s*(.+) <.+/$1/;
      my $rcode = $e->{ind2};
      my $rtext = $relations->{$rcode} || '';
      my $rel = $refdata->{electronicAccessRelationships}->{$rtext} || $refdata->{electronicAccessRelationships}->{'No information provided'};
      my $er = { uri => $uri, linkText => $ltext, relationshipId => $rel };
      push @{ $h->{electronicAccess} }, $er;
    }
    
    my $cdate = $ff->{83}->{value} || '';
    my $udate = $ff->{84}->{value} || '';
    $h->{metadata} = make_meta($id_admin, $cdate, $udate);
    my $hr = $json->encode($h);
    write_objects($OUT, $hr . "\n");

    $count++;
    $ttl++;
  } 
  close IN;
}
my $end = time;
my $secs = $end - $start;
my $mins = $secs/60;
print "\n$ttl Sierra holdings processed in $mins min.";
print "\n$errcount Errors\n\n";

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
    my @fords;
    my $pile = {};
    my $otag = ($etag == 863) ? '866' : ($etag == 864) ? '867' : '868';
    foreach (keys %{ $field->{$etag} }) {
      my $link = $_;
      my $pat = $field->{$ptag}->{$link}[0];
      my $ford = '';
      foreach (@{ $field->{$etag}->{$link} }) {
        my $enum = $_;
        my $splits = {};
        my @codes;
        my $open = 0;
        foreach (sort keys %{ $enum }) {
          my $c = $_;
          if ($c eq '8') {
            $ford = $enum->{$c};
            push @fords, $ford;
          }
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
            my $suf = $pat->{$_} || '';
            if (/[a-h]/ && $suf !~ /\((month|season|day|year)\)/) {
              push @enumparts, $suf . $splits->{$_}[$el];
            } else {
              my $p = $suf;
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
          my $cronpart = ($cronparts[1]) ? join ' ', @cronparts : $cronparts[0];
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
        my $pkey = "$otag--$ford";
        $pile->{$pkey} = { text=>$statement, staffnote=>$snote, note=>$note, order=>$ford };
      }
      
    }
    foreach my $ford (sort @fords) {
      my $pkey = "$otag--$ford";
      push @{ $out->{$otag} }, $pile->{$pkey};
    }
  }
  foreach my $stag ('866', '867', '868') {
    foreach my $key (keys %{ $field->{$stag} }) {
      foreach (@{ $field->{$stag}->{$key} }) {
        $out->{$stag} = [];
        my $snote = $_->{x} || '';
        my $note = $_->{z} || '';
        my $text = $_->{a} || '';
        push @{ $out->{$stag} }, { text=>$text, staffnote=>$snote, note=>$note };
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
      my $num = '0';
      foreach my $s (@{ $v->{subfields} }) {
        my $code = $s->{tag};
        my $val = $s->{content};
        if ($code eq '8') {
          $num = $val || '0';
          $num =~ s/\..+//;
        }
        $sub->{$code} = $val;
        push @ord, $code, $val;
      }
      $sub->{ind1} = $v->{ind1};
      $sub->{ind2} = $v->{ind2};
      push @{ $sub->{arr} }, @ord;
      if ($num || $num eq "0") {
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
  if ($type =~ /[fnzwx]/) {
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

sub make_meta {
  my $user = shift;
  my $cdate = shift;
  my $udate = shift;
  my $out = {
    createdDate=>$cdate,
    createdByUserId=>$user,
    updatedDate=>$udate,
    updatedByUserId=>$user
  };
  return $out;
}
