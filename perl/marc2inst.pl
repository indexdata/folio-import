#! /usr/bin/perl

# Create instance records from raw marc.

use MARC::Record;
use Data::Dumper;
use JSON;
use Data::UUID;
$Data::Dumper::Indent = 1;

binmode STDOUT, ":utf8";

my $rules_file = shift;
my $ref_dir = shift;
if (! $ARGV[0]) {
  die "Usage: ./marc2inst.pl <mapping_rules> <ref_data_dir> <raw_marc_files>\n";
}

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
            my $name;
            if ($refroot =~ /^(instanceTypes|contributorTypes|instanceFormats)$/) {
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

my $blvl = {
  'm' => 'Monograph',
  'i' => 'Integrating Resource',
  's' => 'Serial'
};

my $relations = {
  '0' => 'Resource',
  '1' => 'Version of resource',
  '2' => 'Related resource',
  '3' => 'No information provided'
};

my $pub_roles = {
  '0' => 'Production',
  '1' => 'Publication',
  '2' => 'Distribution',
  '3' => 'Manufacture',
  '4' => 'Copyright notice date'
};

$ref_dir =~ s/\/$//;
my $refdata = getRefData($ref_dir);

sub getData {
    my $field = shift;
    my $ent = shift;
    my @data;
    my @rules = @{ $ent->{rules} };
    my @funcs;
    my $default;
    my $params;
    foreach (@rules) {
      foreach (@{ $_->{conditions} }) {
        @funcs = split /,\s*/, $_->{type};
        $params = $_->{parameter};
      }
      $default = $_->{value};
    }
    my @delimiters = @{ $ent->{subFieldDelimiter} };
    if ($field->tag() =~ /^00/) {
      my $d;
      if ($default) {
        $d = $default;
      } else {
        $d = $field->data();
      }
      push @data, $d;
      $ent->{applyRulesOnConcatenatedData} = true;
    } elsif (@delimiters) {
      foreach (@delimiters) {
        my $val = $_->{value};
        my @group;
        foreach (@{ $_->{subfields} }) {
          my @subfield = $field->subfield($_); 
          foreach (@subfield) {
            $_ = processing_funcs($_, $field, $params, @funcs) unless $ent->{applyRulesOnConcatenatedData};
            push @group, $_
          }
        }
        push @data, join $val, @group;
      }
    } else {
      if ($default) {
        push @data, $default;
      } else {
        foreach (@{ $ent->{subfield} }) {
          my @subfield = $field->subfield($_);
          foreach (@subfield) {
            $_ = processing_funcs($_, $field, $params, @funcs) unless $ent->{applyRulesOnConcatenatedData};
            push @data, $_;
          }
        }
      }
    }
    my $out = join ' ', @data;
    $out = processing_funcs($out, $field, $params, @funcs) if $ent->{applyRulesOnConcatenatedData};
    return $out;
  }

  sub processing_funcs {
    my $out = shift;
    my $field = shift;
    my $params = shift;
    foreach (@_) {
      if ($_ eq 'trim_period') {
        $out =~ s/\.\s*$//;
      } elsif ($_ eq 'trim') {
        $out =~ s/^\s+|\s+$//g;
      } elsif ($_ eq 'remove_ending_punc') {
        $out =~ s/[;:,\/+= ]$//g;
      } elsif ($_ eq 'remove_prefix_by_indicator') {
        my $ind = $field->indicator(2);
        $out = substr($out, $ind);
      } elsif ($_ eq 'set_identifier_type_id_by_name') {
        my $name = $params->{name};
        $out = $refdata->{identifierTypes}->{$name};
      } elsif ($_ eq 'set_contributor_name_type_id') {
        my $name = $params->{name};
        $out = $refdata->{contributorNameTypes}->{$name};
      } elsif ($_ eq 'set_contributor_type_id') {
        $out = $refdata->{contributorTypes}->{$out} || '';
      } elsif ($_ eq 'set_contributor_type_text') {
        # Not sure what's supposed to happen here...
      } elsif ($_ eq 'set_note_type_id') {
        my $name = $params->{name};
        $out = $refdata->{instanceNoteTypes}->{$name};
      } elsif ($_ eq 'set_alternative_title_type_id') {
        my $name = $params->{name};
        $out = $refdata->{alternativeTitleTypes}->{$name};
      } elsif ($_ eq 'set_electronic_access_relations_id') {
        my $ind = $field->indicator(2);
        my $name = $relations->{$ind};
        $out = $refdata->{electronicAccessRelationships}->{$name} || '';
      } elsif ($_ eq 'set_classification_type_id') {
        my $name = $params->{name};
        $out = $refdata->{classificationTypes}->{$name};
      } elsif ($_ eq 'set_instance_format_id') {
        $out = $refdata->{instanceFormats}->{$out} || '';
      } elsif ($_ eq 'set_publisher_role') {
        $ind2 = $field->indicator(2);
        $out = $pub_roles->{$ind2} || '';
      } elsif ($_ eq 'capitalize') {
        $out = ucfirst $out;
      } elsif ($_ eq 'char_select') {
        my $from = $params->{from};
        my $to = $params->{to};
        my $len = $to - $from;
        $out = substr($out, $from, $len);
      } elsif ($_ eq 'set_instance_type_id') {
        $out = $refdata->{instanceTypes}->{$out};
      } elsif ($_ eq 'set_identifier_type_id_by_value') {
        my $name;
        if ($out =~ /^(\(OCoLC\)|ocm|ocn|on).*/) {
          $name = 'OCLC';
        } else {
          $name = 'System control number';
        }
        $out = $refdata->{identifierTypes}->{$name};
      } elsif ($_ eq 'remove_substring') {
        my $ss = $params->{substring};
        $out =~ s/$ss//g;
      }
    }
    return $out;
  }

my $rules = getRules($rules_file);



my $ftypes = {
  id => 'string',
  hrid => 'string',
  source => 'string',
  title => 'string',
  indexTitle => 'string',
  alternativeTitles => 'array.object',
  editions => 'array',
  series => 'array',
  identifiers => 'array.object',
  contributors => 'array.object',
  subjects => 'array',
  classifications => 'array.object',
  publication => 'array.object',
  publicationFrequency => 'array',
  publicationRange => 'array',
  electronicAccess => 'array.object',
  instanceTypeId => 'string',
  instanceFormatIds => 'array',
  physicalDescriptions => 'array',
  languages => 'array',
  notes => 'array.object',
  modeOfIssuanceId => 'string',
  catalogedDate => 'string',
  previouslyHeld => 'boolean',
  staffSuppress => 'boolean',
  discoverySuppress => 'boolean',
  statisticalCodeIds => 'array',
  sourceRecordFormat => 'string',
  statusId => 'string',
  statusUpdatedDate => 'string',
  tags => 'object',
  holdingsRecords2 => 'array.object',
  natureOfContentTermIds => 'array.string'
};


foreach (@ARGV) {
  my $infile = $_;
  if (! -e $infile) {
    die "Can't find raw Marc file!"
  } elsif (! -e $ref_dir) {
    die "Can't find reference data directory!";
  } elsif (! -e $rules_file) {
    die "Can't find mapping rules file!";
  }

  my $save_path = $infile;
  $save_path =~ s/^(.+)\..+$/$1_instances.json/;

  # open a collection of raw marc records
  $/ = "\x1D";
  my $count = 0;
  open RAW, "<:encoding(UTF-8)", $infile;
  my $coll = { instances => [] };
  while (<RAW>) {
    my $rec = {
      id => uuid(),
      alternativeTitles => [],
      editions => [],
      series => [],
      identifiers => [],
      contributors => [],
      subjects => [],
      classifications => [],
      publication => [],
      publicationFrequency => [],
      publicationRange => [],
      electronicAccess => [],
      instanceFormatIds => [],
      physicalDescriptions => [],
      languages => [],
      notes => [],
      staffSuppress => false,
      discoverySuppress => false,
      statisticalCodeIds => [],
      tags => {},
      holdingsRecords2 => [],
      natureOfContentTermIds => [],
      statusId => '52a2ff34-2a12-420d-8539-21aa8d3cf5d8'
    };
    $count++;
    my $raw = $_;
    my $marc = MARC::Record->new_from_usmarc($raw);
    foreach ($marc->fields()) {
      my $ldr = $marc->leader();
      my $blevel = substr($ldr, 7, 1);
      my $mode_name = $blvl->{$blevel} || 'Other';
      $rec->{modeOfIssuanceId} = $refdata->{issuanceModes}->{$mode_name};
      my $field = $_;
      my $tag = $_->tag();
      my @entities;
      my $fld_conf = $rules->{$tag};
      if ($fld_conf) {
        my $ent = $fld_conf->[0]->{entity};
        if ($ent) {
          foreach ($ent) {
            push @entities, $ent;
          }
        } else {
          @entities = $fld_conf;
        }
        foreach (@entities) {
          my @entity = @$_;
          my $data_obj = {};
          foreach (@entity) {
            my @targ = split /\./, $_->{target};
            my $flavor = $ftypes->{$targ[0]};
            my $data = getData($field, $_);
            next unless $data;
            if ($flavor eq 'array') {
              if ($_->{subFieldSplit}) { # subFieldSplit is only used for one field, 041, which may have a lang string like engfreger.
                my $val = $_->{subFieldSplit}->{value};
                my @splitdata = $data =~ /(\w{$val})/g;
                $rec->{$targ[0]} = [] if $tag eq '041';  # we don't want duplicate languages since it probably alread exists in the 008;
                push $rec->{$targ[0]}, @splitdata;
              } else {
                push $rec->{$targ[0]}, $data;
              }
            } elsif ($flavor eq 'array.object') {
              $data_obj->{$targ[0]}->{$targ[1]} = $data;
            } elsif ($flavor eq 'object') {
            } elsif ($flavor eq 'boolean') {
            } else {
              $rec->{$targ[0]} = $data;
            }
          }
          foreach (keys $data_obj) {
            if ($ftypes->{$_} eq 'array.object') {
              push $rec->{$_}, $data_obj->{$_};
            }
          }
        }
      }
    }
    push @{ $coll->{instances} }, $rec;
  }
  
  $out = JSON->new->pretty->encode($coll);
  print $out;
  exit;
  open OUT, ">:encoding(UTF-8)", $save_path;
  print OUT $out;
  print "\nDone! SRS records saved to $save_path\n";
}
