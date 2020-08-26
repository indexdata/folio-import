#! /usr/bin/perl

# Create instance records from raw marc using default (or updated) Folio mapping rules.
#
# There are couple of bash scripts that will fetch mapping rules and ref data:
#   get_mapping_rules.sh
#   reference_inventory.sh
#
# You must first create an okapi session by running login.sh to use the above scripts.
#
# Direct the output of get_mapping_rules.sh to some file, the reference_inventory.sh script
# will require a directory argument.
#
# This script will output a single instances collection and will be saved to the same
# directory as the raw marc file.

use strict;
use warnings;

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
      foreach (keys %$json) {
        if ($_ ne 'totalRecords') {
          my $refroot = $_;
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

sub process_entity {
    my $field = shift;
    my $ent = shift;
    my @data;
    my $out;
    my @rules;
    if ($ent->{rules}) {
      @rules = @{ $ent->{rules} };
    }
    my @funcs;
    my $default;
    my $params;
    my $tag = $field->tag();
    my $func_type;
    my $subs;
    if ($ent->{subfield}) {
      $subs = join '', @{ $ent->{subfield} };
    }
    foreach (@rules) {
      foreach (@{ $_->{conditions} }) {
        $func_type = $_->{type};
        @funcs = split /,\s*/, $_->{type};
        $params = $_->{parameter};
      }
      $default = $_->{value};
    }
    if ($tag =~ /^00/) {
      my $d;
      if ($default) {
        $d = $default;
      } else {
        $d = $field->data();
      }
      push @data, $d;
      $ent->{applyRulesOnConcatenatedData} = JSON::true;
    } elsif ($default || ($func_type && $func_type =~ /\bset_/ && $params)) {
      my $add = 0;
      if (!$subs) {
        $add = 1;
      } else {
        foreach ($field->subfields()) {
          if ($subs =~ /$_->[0]/ && $_->[1] =~ /\S/) {
            $add = 1;
            last;
          }
        }
      }
      if ($default) {
        push @data, $default if $add;
      } else {
        my $d = processing_funcs('', $field, $params, @funcs);
        push @data, $d if $add;
      }
    } else {
      my $tmp_field = $field->clone();
      if (!$ent->{applyRulesOnConcatenatedData}) {
        my $i = 0;
        my $sf;
        foreach (@{ $tmp_field->{_subfields} }) {
          if ($i % 2 && $subs =~ /$sf/) {
            $_ = processing_funcs($_, $tmp_field, $params, @funcs);
          } else {
            $sf = $_;
          }
          $i++;
        }
      }
      if ($ent->{subFieldDelimiter}) {
        foreach (@{ $ent->{subFieldDelimiter} }) {
          my $subs = join '', @{ $_->{subfields} };
          push @data, $tmp_field->as_string($subs, $_->{value}) if $subs; 
        }
      } else {
        push @data, $tmp_field->as_string($subs) if $subs;
      }
    }
    
    if ($data[0]) {
      $out = join ' ', @data;
      $out = processing_funcs($out, $field, $params, @funcs) if $ent->{applyRulesOnConcatenatedData};
    }
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
        $out = $refdata->{identifierTypes}->{$name} or die "Can't find identifierType for $name!";
      } elsif ($_ eq 'set_contributor_name_type_id') {
        my $name = $params->{name};
        $out = $refdata->{contributorNameTypes}->{$name} or die "Can't find contributorNameType for $name";
      } elsif ($_ eq 'set_contributor_type_id') {
        $out = $refdata->{contributorTypes}->{$out} || '';
      } elsif ($_ eq 'set_contributor_type_text') {
        # Not sure what's supposed to happen here...
      } elsif ($_ eq 'set_note_type_id') {
        my $name = $params->{name};
        $out = $refdata->{instanceNoteTypes}->{$name} or die "Can't find instanceNoteType for $name";
      } elsif ($_ eq 'set_alternative_title_type_id') {
        my $name = $params->{name};
        $out = $refdata->{alternativeTitleTypes}->{$name} or die "Can't find alternativeTitleType for $name";
      } elsif ($_ eq 'set_electronic_access_relations_id') {
        my $ind = $field->indicator(2);
        my $name = $relations->{$ind};
        $out = $refdata->{electronicAccessRelationships}->{$name} || '';
      } elsif ($_ eq 'set_classification_type_id') {
        my $name = $params->{name};
        $out = $refdata->{classificationTypes}->{$name} or die "Can't find classificationType for $name";
      } elsif ($_ eq 'set_instance_format_id') {
        $out = $refdata->{instanceFormats}->{$out} || '';
      } elsif ($_ eq 'set_publisher_role') {
        my $ind2 = $field->indicator(2);
        $out = $pub_roles->{$ind2} || '';
      } elsif ($_ eq 'capitalize') {
        $out = ucfirst $out;
      } elsif ($_ eq 'char_select') {
        my $from = $params->{from};
        my $to = $params->{to};
        my $len = $to - $from;
        $out = substr($out, $from, $len);
      } elsif ($_ eq 'set_instance_type_id') {
        my $it = $params->{unspecifiedInstanceTypeCode} || $out;
        $out = $refdata->{instanceTypes}->{$it};
      } elsif ($_ eq 'set_issuance_mode_id') {
        $out = '';
      } elsif ($_ eq 'set_identifier_type_id_by_value') {
        my $name;
        my $data = $field->subfield('a');
        if ($data && $data =~ /^(\(OCoLC\)|ocm|ocn|on).*/) {
          $name = 'OCLC';
        } else {
          $name = 'System control number';
        }
        $out = $refdata->{identifierTypes}->{$name} or die "Can't find identifierType for $name";
      } elsif ($_ eq 'remove_substring') {
        my $ss = $params->{substring};
        $out =~ s/$ss//g;
      }
    }
    return $out;
  }

my $mapping_rules = getRules($rules_file);

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

# We need to know upfront which tags support repeated subfields.
my $repeat_subs = {};
foreach (keys %{ $mapping_rules }) {
  my $rtag = $_;
  foreach (@{ $mapping_rules->{$rtag} }) {
    if ($_->{entityPerRepeatedSubfield}) {
      my $conf = $_;
      $repeat_subs->{$rtag} = [] unless $repeat_subs->{$rtag};
      foreach (@{ $conf->{entity} }) {
        push @{ $repeat_subs->{$rtag} }, $_->{subfield}->[0] if $_->{target} !~ /Id$/;
      }
    }
  }
}

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
  my $id_map = $infile;
  $id_map =~ s/^(.+)\..+$/$1_instances.map/;
  my $save_ids = 0;
  if (! -e $id_map) {
    open IDMAP, ">>$id_map";
    print "Creating ID map file...\n";
    $save_ids = 1;
  }

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
      staffSuppress => JSON::false,
      discoverySuppress => JSON::false,
      statisticalCodeIds => [],
      tags => {},
      holdingsRecords2 => [],
      natureOfContentTermIds => [],
      statusId => '52a2ff34-2a12-420d-8539-21aa8d3cf5d8'
    };
    
    $count++;
    my $raw = $_;
    my $marc = MARC::Record->new_from_usmarc($raw);
    my $ldr = $marc->leader();
    my $blevel = substr($ldr, 7, 1);
    my $mode_name = $blvl->{$blevel} || 'Other';

    # So somewhere along the ling, FOLIO started returning modes names in lowercase, so we had better accound for that;
    my $lc_mode_name = lc $mode_name;
    if ($lc_mode_name eq 'monograph') { $lc_mode_name = 'single unit'}
    if ($refdata->{issuanceModes}->{$mode_name}) {
      $rec->{modeOfIssuanceId} = $refdata->{issuanceModes}->{$mode_name};
    } elsif ($refdata->{issuanceModes}->{$lc_mode_name}) {
      $rec->{modeOfIssuanceId} = $refdata->{issuanceModes}->{$lc_mode_name};
    } else {
      $rec->{modeOfIssuanceId} = $refdata->{issuanceModes}->{unspecified};
    }
    my @marc_fields = $marc->fields();
    MARC_FIELD: foreach (@marc_fields) {
      my $field = $_;
      my $tag = $_->tag();
      
      # Let's determine if a subfield is repeatable, if so create append separate marc fields for each subfield;
      foreach (@{ $repeat_subs->{$tag} }) {
        my $main_code = $_;
        my $all_codes = join '', @{ $repeat_subs->{$tag} };
        my @sf = $field->subfield($main_code);
        my $occurence = @sf;
        if ($occurence > 1) {
          my $new_field = {};
          my $i = 0;
          my @subs = $field->subfields();
          foreach (@subs) {
            my ($code, $sdata) = @$_;
            if ($code eq $main_code) {
              $new_field = MARC::Field->new($tag, $field->{_ind1}, $field->{_ind2}, $code => $sdata);
            } elsif ($new_field->{_tag}) {
              $new_field->add_subfields($code => $sdata );
            }
            $i++;
            my $ncode;
            if ($subs[$i]) {
              ($ncode) = @{ $subs[$i] };
            }
            push @marc_fields, $new_field if (index($all_codes, $ncode) != -1 && $new_field->{_tag}) || $ncode eq undef;
          }
          next MARC_FIELD;
        }
      }
      my $fld_conf = $mapping_rules->{$tag};
      my @entities;
      if ($fld_conf) {
        if ($fld_conf->[0]->{entity}) {
          foreach (@{ $fld_conf }) {
            if ($_->{entity}) {
              push @entities, $_->{entity};
            }
          }
        } else {
          @entities = $fld_conf;
        }
        foreach (@entities) {
          my @entity = @$_;
          my $data_obj = {};
          foreach (@entity) {
            my @required;
            if ( $_->{requiredSubfield} ) {
              @required = @{ $_->{requiredSubfield} };
            }
            if ($required[0] && !$field->subfield($required[0])) {
              next;
            }
            my @targ;
            my $flavor;
            if ($_->{target}) {
              @targ = split /\./, $_->{target};
              $flavor = $ftypes->{$targ[0]};
            }
            my $data = process_entity($field, $_);
            next unless $data;
            if ($flavor eq 'array') {
              my $first_targ_data = $rec->{$targ[0]};
              if ($_->{subFieldSplit}) { # subFieldSplit is only used for one field, 041, which may have a lang string like engfreger.
                my $val = $_->{subFieldSplit}->{value};
                my @splitdata = $data =~ /(\w{$val})/g;
                push @$first_targ_data, @splitdata;
              } else {
                push @$first_targ_data, $data;
              }
            } elsif ($flavor eq 'array.object') {
              $data_obj->{$targ[0]}->{$targ[1]} = $data;
            } elsif ($flavor eq 'object') {
            } elsif ($flavor eq 'boolean') {
            } else {
              $rec->{$targ[0]} = $data;
            }
          }
          foreach (keys %$data_obj) {
            if ($ftypes->{$_} eq 'array.object') {
              push @{ $rec->{$_} }, $data_obj->{$_};
            }
          }
        }
      }
    }
    # Do some some record checking and cleaning
    $rec->{subjects} = dedupe(@{ $rec->{subjects} });
    $rec->{languages} = dedupe(@{ $rec->{languages} });
    $rec->{series} = dedupe(@{ $rec->{series} });
    
    if ($save_ids) {
      print IDMAP "$rec->{hrid}\t$rec->{id}\n";
    }
    push @{ $coll->{instances} }, $rec;
    print "Processing #$count " . substr($rec->{title}, 0, 60) . "\n";
    # last if $count == 10;
  }
  
  my $out = JSON->new->pretty->encode($coll);
  # print $out;
  open OUT, ">:encoding(UTF-8)", $save_path;
  print OUT $out;
  print "\nDone! $count instance records saved to $save_path\n";
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
