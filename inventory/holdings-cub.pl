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
use MARC::Record;
use MARC::Record::MiJ;
use Data::Dumper;

my $version = '1';
my $isil = 'CoU';
my $ver = '1';

my $source_id = '036ee84a-6afd-4c3c-9ad3-4a12ab875f59'; #MARC
my $tm = localtime;
my $snapshot = uuid($tm->datetime);
my $snap = {
    jobExecutionId=>$snapshot,
    status=>'COMMITTED',
    processingStartedDate=>$tm->datetime . '.000+0000'
  };

binmode STDOUT, ":utf8";

my $ref_dir = shift;
my $map_file = shift;
if (! $ARGV[0]) {
  die "Usage: ./holdings-cub.pl <ref_data_dir> <instances_tsv_map_file> <iii_holdings_jsonl_file>\n";
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
      my $code = $col[0] || '';
      my $name = $col[2] || '';
      if ($prop eq 'statuses') {
        $tsvmap->{$prop}->{$code} = $name;
      } else {
        if ($prop eq 'locations') {
          $name = $col[1] || '';
          $name =~ s/^.+\///;
          $tsvmap->{loc_codes}->{$code} = $name;
          $loc_code_map->{$code} = $name || 'UNMAPPED';
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
# print Dumper($refdata); exit;
my $tofolio = makeMapFromTsv($ref_dir, $refdata);
# print Dumper($tofolio->{locations}); exit;
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
my $mrc_count = 0;
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

  my $srsfile = "$dir/${fn}_srs.jsonl";
  unlink $srsfile;
  open my $SRS, ">>:encoding(UTF-8)", $srsfile;

  my $snapfile = "$dir/${fn}_snapshot.jsonl";
  open my $SNP, ">:encoding(UTF-8)", $snapfile;
  my $snapstr = $json->encode($snap);
  write_objects($SNP, $snapstr . "\n");

  my $hmapfile = "$dir/holdings.map";
  unlink $hmapfile;
  open my $HMAP, ">>:encoding(UTF-8)", $hmapfile;

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
      print "WARN instanceId not found for $bid!\n";
      $errcount++;
      next;
    }

    my $vf = {};
    my $leader = '';
    my $vfcn = '';
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
    }
    # print Dumper($vf);
    my $stitle = $vf->{'843'}->[0]->{a} || '';

    my $ff = $obj->{fixedFields};
    my $h = {};
    my $loc_code = $ff->{40}->{value} || 'xxxxx';
    $loc_code =~ s/\s*$//;
    my $hid = "c" . $obj->{id};
    next if $seen->{$hid};
    $seen->{$hid} = 1;
    my $hkey = "$bid-$loc_code";
    $h->{id} = uuid($hid);
    print $HMAP "$bid|$loc_code|$h->{id}|$hid\n";
    $h->{_version} = $ver;
    $h->{formerIds} = [ $obj->{id} ];
    $h->{hrid} = $hid;
    $h->{instanceId} = $b[0];
    $h->{shelvingTitle} = $stitle if $stitle;
    my $loc_id = $tofolio->{locations}->{$loc_code} || $refdata->{locations}->{UNMAPPED};
    if (!$tofolio->{locations}->{$loc_code}) {
      print "WARN: LocationId not found for $loc_code\n";
    }
    $h->{permanentLocationId} = $loc_id;
    $h->{sourceId} = $source_id;
    my $typecode = substr($leader, 6, 1) || '';
    my $typestr = $typemap->{$typecode} || '';
    my $typeid = $refdata->{holdingsTypes}->{$typestr} || $refdata->{holdingsTypes}->{Serial};
    $h->{holdingsTypeId} = $typeid;
    my $cntype = $b[2];
    my $cn = $b[1];
    my @tags = ('050', '090');
    my @csubs = ('a','b');
    foreach my $tag (@tags) {
      if ($vf->{$tag}) {
        my @el;
        foreach my $sub (@csubs) {
          push @el, $vf->{$tag}[0]->{$sub} if $vf->{$tag}[0]->{$sub};
        }
        $cn = join ' ', @el;
      }
    }
    $h->{callNumberTypeId} = $cntype || '6caca63e-5651-4db6-9247-3205156e9699'; #other
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
      # print Dumper($hs);
      foreach my $f (@{ $hs->{$t}}) {
        push @{ $h->{$htype} }, make_statement($f->{text}, $f->{note});
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
    
    my $hr = $json->encode($h);
    write_objects($OUT, $hr . "\n");

    if ($obj) {
      my $vf = {};
      my $ff = $obj->{fixedFields};
      my $marc = MARC::Record->new();
      my $f001 = MARC::Field->new('001', $h->{hrid});
      $marc->insert_fields_ordered($f001); 
      my $f004 = MARC::Field->new('004', $bid);
      $marc->insert_fields_ordered($f004);
      my $updated = $ff->{84}->{value};
      my $created = $ff->{83}->{value};
      $updated =~ s/[-TZ:]//g;
      my $f005 = MARC::Field->new('005', "$updated.0");
      $marc->insert_fields_ordered($f005);
      my $loc_code = $ff->{40}->{value} || 'xxxxx';
      $loc_code =~ s/\s*$//;
      my $fcode = $loc_code_map->{$loc_code};
      my $f852 =  MARC::Field->new('852', '0', ' ', 'b' => $fcode);
      $f852->add_subfields('l', $stitle) if $stitle;
      $marc->insert_fields_ordered($f852);

      my $f008_seen = 0;
      foreach my $f (@{ $obj->{varFields} }) {
        my $t = $f->{marcTag} || '';
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
        } elsif ($t =~ /\d/ && $t lt '010') {
          if ($t eq '008') {
            $f008_seen = 1;
            $f->{content} = substr($f->{content}, 0, 32);
          }
          my $field = MARC::Field->new($t, $f->{content}) if $f->{content};
          $marc->insert_fields_ordered($field); 
        } elsif ($ft && $f->{content}) {
          push @{ $vf->{$ft} }, $f->{content};
          if ($ft eq '_') {
            $marc->leader($f->{content});
          } else {
            my $field = MARC::Field->new('561', ' ', ' ', 'a' => $f->{content});
            $marc->insert_fields_ordered($field); 
          }
        } 
      }
      if (!$f008_seen) {
          $created =~ s/^..(..)-(..)-(..).*/$1$2$3/;
          my $f008 = MARC::Field->new('008', "${created}0u    0   0   uuund       ");
          $marc->insert_fields_ordered($f008);
      }

      # my $hs = statement($obj);
      foreach my $t ('866', '867', '868') {
        foreach my $f (@{ $hs->{$t}}) {
          my $st = make_statement($f->{text}, $f->{note});
          if ($f->{text}) {
            my $field = MARC::Field->new($t, ' ', ' ', '8' => '1.1', 'a' => $f->{text}); 
            $marc->insert_fields_ordered($field); # if !$marc->field($t, 'a');
          }
        }
      }
      my $raw = $marc->as_usmarc();
      my $srs = make_srs($marc, $raw, '', $h->{hrid}, $snapshot, $h->{id});
      my $s = $json->encode($srs);
      write_objects($SRS, $s . "\n");
      $mrc_count++;
    }

    $count++;
    $ttl++;
  } 
  close IN;
}
my $end = time;
my $secs = $end - $start;
my $mins = $secs/60;
print "\n$mrc_count MARC records created...";
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
        $pile->{$pkey} = { text=>$statement, staffnote=>$snote, note=>$note };
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
  if ($type =~ /[nzx]/) {
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

sub make_srs {
    my $marc = shift;
    my $raw = shift;
    my $iid = shift;
    my $hrid = shift;
    my $snap_id = shift;
    my $hid = shift || '';
    my $srs = {};

    my $mij = MARC::Record::MiJ->to_mij($marc);
    my $parsed = decode_json($mij);
    
    $srs->{id} = uuid($hid . 'srs');
    my $nine = {};
    $nine->{'999'} = { subfields=>[ { 'i'=>$iid || $hid }, { 's'=>$srs->{id} } ] };
    $nine->{'999'}->{'ind1'} = 'f';
    $nine->{'999'}->{'ind2'} = 'f';
    push @{ $parsed->{fields} }, $nine;
    $srs->{snapshotId} = $snap_id;
    $srs->{matchedId} = $srs->{id};
    $srs->{generation} = 0;
    $srs->{rawRecord} = { id=>$srs->{id}, content=>$raw };
    $srs->{parsedRecord} = { id=>$srs->{id}, content=>$parsed };
    if ($hid) {
      $srs->{externalIdsHolder} = { holdingsId=>$hid, holdingsHrid=>$hrid };
      $srs->{recordType} = 'MARC_HOLDING';
    }
    else {
      $srs->{externalIdsHolder} = { instanceId=>$iid, instanceHrid=>$hrid };
      $srs->{recordType} = 'MARC_BIB';
    }
    return $srs;
}
