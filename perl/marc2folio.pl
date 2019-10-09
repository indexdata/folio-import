#! /usr/bin/perl

use MARC::File::USMARC;
use Data::Dumper;
use JSON;
use Data::UUID;

binmode STDOUT, ":utf8";

my $infile = shift or die "Usage: ./marc2folio.pl <raw_marc_file> <map_file> <reference_data_dir>\n";
if (! -e $infile) {
  die "Can't find input file!\n"
}
my $file = MARC::File::USMARC->in($infile);

my $mmfile = shift or die "You must include the path to a Marc Map file.\n";
open MAP, $mmfile or die "Can't find marc.map file!\n";
my $mmap = { instances => [], holdings => [], items => [] };
my $rectype;
while (<MAP>) {
  chomp;
  next if /^#|^\s*$/;
  if (/^\[(\w+)/) {
    $rectype = $1;
    next;
  }
  print $rectype . "\n";
  @m = split(/\|/);
  push $mmap->{$rectype}, { tag => $m[0], ind1 => $m[1], ind2 => $m[2], subs => $m[3], bytes => $m[4], folio => $m[5], type => $m[6], alt => $m[8] };
}
my $refdir = shift or die "You must include the reference data directory.\n";
if (! -e $refdir) {
  die "Can't find the reference data directory\n";
}
my $refmap = {};
foreach (glob "$refdir/*.json") {
  local $/;
  open IN, $_;
  my $jtext = <IN>;
  my $json = {};
  eval { $json = decode_json($jtext); };
  foreach(keys $json) {
    my $prop = $_;
    next if $prop eq 'totalRecords';
    foreach (@{ $json->{$_} }) {
      my $name = $_->{name};
      $refmap->{$prop}->{$name} = $_->{id};
    }
  }
}
# print Dumper($refmap);
# exit;
my $inst = { instances => [] };
my $hold = { holdings => [] };
my $item = { items => [] };
my $out = {};
while (my $marc = $file->next()) {
  $rec = {};
  foreach (keys $mmap) {
    my $rtype = $_;
    $out->{$rtype} = [];
    my $rec->{$rtype} = {};
    $rec->{$rtype}->{source} = 'FOLIO';
    my $ug = Data::UUID->new;
    my $uuid = $ug->create();
    my $uustr = lc($ug->to_string($uuid));
    $rec->{$rtype}->{id} = $uustr;
    my $exists = {};
    foreach (@{ $mmap->{$rtype} }) {
      my $tag = $_->{tag};
      my $subs = $_->{subs};
      my $folio = $_->{folio};
      my $type = $_->{type};
      my $bytes = $_->{bytes};
      my $alt = $_->{alt};
      my $child;
      if ($folio =~ /^(.+?)\.(.+)/) {
        $child = $2;
        $folio = $1;
      }
      if ($alt and $exists->{$folio}) {
        next;
      }
      if ($tag eq 'LDR') {
        my $data = substr($marc->leader(), $subs, 1);
        if ($folio =~ /^instanceFormatIds/) {
          $rec->${rtype}->{$folio} = [ $data ];
        } elsif ($folio == 'instanceTypeId') {
          $rec->${rtype}->{$folio} = $refmap->{instanceTypes}->{$type};
        } else {
          $rec->${rtype}->{$folio} = $data;
        }
      }
      my $repeat = false;
      if ($folio =~ /^(contributors|subects|identifiers|languages|publication|classifications|subjects)$/) {
        $repeat = true;
      }
      # if ($child && $prevfolio == $folio) {
      #  $repeat = false;
      # }
      my $prevfolio = $folio;
      my @field = $marc->field($tag);
      if ($repeat eq true && ! $rec->${rtype}->{$folio}) {
          $rec->${rtype}->{$folio} = [];
      }
      foreach (@field) {
        my @dlist = ();
        if (length($subs) == 1) {
          my @subfields = $_->subfield($subs);
          foreach (@subfields) {
            push @dlist, $_;
          }
        } else {
          $dlist[0] = $_->as_string($subs);
        }
        foreach (@dlist) {
          $exists->{$folio} = 1;
          my $fdata;
          my $data = $_;
          if ($bytes) {
            my $start = $bytes;
            my $len = 1;
            if ($bytes =~ /\-/) {
              my @b = split(/\-/, $bytes);
              $start = $b[0];
              $len = $b[1] - $b[0] + 1;
            }
            $data = substr($data, $start, $len);
          }
          if ($folio eq 'contributors') {
            my $data_obj->{name} = $data;
            $data_obj->{contributorNameTypeId} = $refmap->{contributorNameTypes}->{$type};
            $fdata = $data_obj;
          } elsif ($folio eq 'identifiers') {
            my $data_obj->{value} = $data;
            $data_obj->{identifierTypeId} = $refmap->{identifierTypes}->{$type} || $type;
            $fdata = $data_obj;
          } elsif ($folio eq 'classifications') {
            my $data_obj->{classificationNumber} = $data;
            $data_obj->{classificationTypeId} = $refmap->{classificationTypes}->{$type} || $type;
            $fdata = $data_obj;
          } elsif ($child) {
            $data =~ s/[ ,;:]+$//;
            my $data_obj->{$child} = $data;
            $fdata = $data_obj;
          } else {
            $fdata = $data;
          }
          if ($repeat eq true) {
            push $rec->{$folio}, $fdata;
          } elsif ($child) {
            $rec->{$folio}->{$child} = $fdata->{$child};
          } else {
            $rec->{$folio} = $fdata;
          }
        }
      } 
      push @{ $out->{$rtype} }, $rec->{$rtype};
    }
  }
}
$file->close();
my $json = JSON->new->pretty->encode($out);
print $json;