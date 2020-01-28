#! /usr/bin/perl

# Create instance records from raw marc.

use MARC::Record;
use Data::Dumper;
use JSON;
use Data::UUID;

binmode STDOUT, ":utf8";

my $rules_file = shift;
my $ref_dir = shift;

sub uuid {
  my $ug = Data::UUID->new;
  my $uuid = $ug->create();
  my $uustr = lc($ug->to_string($uuid));
  return $uustr;
}

sub getRules {
  my $rfile = shift;
  local $/ = '';
  open my $rules, $rfile or die "Can't open $rfile";
  my $jsonstr = <$rules>;
  my $json = decode_json($jsonstr);
  return $json;
}

sub getRefData {
  my $refdir = shift;
  my $refobj = {};
  local $/ = '';
  foreach (<$refdir/*.json>) {
    my $prop = $_;
    $prop =~ s/^(.+\/)?(.+?)\.json/$2/;
    print "Opening reference data file '$prop.json'\n";    
    open my $refdata, $_ or die "Can't open $_";
    my $jsonstr = <$refdata>;
    my $json = eval { decode_json($jsonstr) };
    if ($@) {
      print "WARN $_ is not valid JSON!\n";
    } else {
      foreach (keys $json) {
        if ($_ ne 'totalRecords') {
          $refroot = $_;
          $refobj->{$refroot} = {};
          foreach (@{ $json->{$_} }) {
            my $name = $_->{name};
            my $id = $_->{id};
            $refobj->{$refroot}->{$name} = $id;
          }
        }
      }
    }
  }
 return $refobj;
}

foreach (@ARGV) {
  my $infile = $_ or die "Usage: ./marc2inst.pl <mapping_rules> <ref_data_dir> <raw_marc_files>\n";
  if (! -e $infile) {
    die "Can't find raw Marc file!"
  } elsif (! -e $ref_dir) {
    die "Can't find reference data directory!";
  } elsif (! -e $rules_file) {
    die "Can't find mapping rules file!";
  }

  my $rules = getRules($rules_file);
  # print Dumper($rules);

  $ref_dir =~ s/\/$//;
  my $refdata = getRefData($ref_dir);
  print Dumper($refdata);

  exit;
  my $save_path = $infile;
  $save_path =~ s/^(.+)\..+$/$1_srs.json/;

  # open a collection of raw marc records
  my $srs_recs = { records=>[] };
  $/ = "\x1D";
  my $count = 0;
  open RAW, "<:encoding(UTF-8)", $infile;
  while (<RAW>) {
    $count++;
    print "\r$count";
    my $raw = $_;
    my $srs = {};
    my $marc = MARC::Record->new_from_usmarc($raw);
    my $mij = MARC::Record::MiJ->to_mij($marc);
    my $parsed = decode_json($mij);
    my $control_num = $marc->subfield('907','a') || $marc->field('001')->{_data};
    next unless $id_map->{$control_num};
    $srs->{id} = uuid();
    my $nine = {};
    $nine->{'999'} = { subfields=>[ { 'i'=>$id_map->{$control_num} }, { 's'=>$srs->{id} } ] };
    $nine->{'999'}->{'ind1'} = 'f';
    $nine->{'999'}->{'ind2'} = 'f';
    push @{ $parsed->{fields} }, $nine;
    $srs->{snapshotId} = 'TO BE ADDED BY LOADING SCRIPT';
    $srs->{matchedId} = uuid();
    $srs->{recordType} = 'MARC';
    $srs->{rawRecord} = { id=>uuid(), content=>$raw };
    $srs->{parsedRecord} = { id=>uuid(), content=>$parsed };
    $srs->{externalIdsHolder} = { instanceId=>$id_map->{$control_num} };
    push $srs_recs->{records}, $srs;
  }
  $out = JSON->new->pretty->encode($srs_recs);
  open OUT, ">:encoding(UTF-8)", $save_path;
  print OUT $out;
  print "\nDone! SRS records saved to $save_path\n";
}
