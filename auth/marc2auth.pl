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
# 
# To add metadata, set FOLIO_USER_ID to user UUID (e.g. export FOLIO_USER_ID=b8e68b41-5473-5d0c-85c8-f4c4eb391b59)
# 
# For optomistic locking version set _VERSION to version number

use strict;
use warnings;

use MARC::Record;
use MARC::Record::MiJ;
use JSON;
use UUID::Tiny ':std';
use Time::Piece;
use File::Basename;
use Data::Dumper;

my $ver = ($ENV{_VERSION}) ? $ENV{_VERSION} : '1';
binmode STDOUT, ":utf8";
$| = 1;

my $version = '1';
my $isil = 'xxx';
my $prefix = '';
my $srstype = 'MARC';
my $source_id = 'f32d531e-df79-46b3-8932-cdd35f7a2264'; # Folio 

my $rules_file = shift;
my $ref_dir = shift;
if (! $ARGV[0]) {
  die "Usage: ./marc2auth.pl <mapping_rules> <ref_data_dir> <raw_marc_files>\n";
}
my $dir = dirname($ARGV[0]);

my $json = JSON->new;
$json->canonical();

my @lt = localtime();
my $mdate = sprintf("%04d-%02d-%02dT%02d:%02d:%02d-0500", $lt[5] + 1900, $lt[4] + 1, $lt[3], $lt[2], $lt[1], $lt[0]);

my $files = {
  auth => 'authorities.jsonl',
  srs => 'srs.jsonl',
  snap => 'snapshot.jsonl',
};

sub uuid {
  my $text = shift;
  my $uuid = create_uuid_as_string(UUID_V5, $text . $isil . $version);
  return $uuid;
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
            $name =~ s/\s+$//;
            $refobj->{$refroot}->{$name} = $id;
          }
        }
      }
    }
  }
 return $refobj;
}

$ref_dir =~ s/\/$//;
my $refdata = getRefData($ref_dir);
# print Dumper($refdata); exit;

my $bcseen = {};

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
        if ($subs =~ /\Q$_->[0]\E/ && $_->[1] =~ /\S/) {
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
        if ($i % 2 && $subs =~ /\Q$sf\E/) {
          $_ = processing_funcs($_, $tmp_field, $params, @funcs);
        } else {
          $sf = $_;
        }
        $i++;
      }
    }
    if ($ent->{subFieldDelimiter}) {
      my @sects;
      my $del = ' ';
      foreach (@{ $ent->{subFieldDelimiter} }) {
        my $subs = join '', @{ $_->{subfields} };
        if ($subs) {
          my $sdata = $tmp_field->as_string($subs, $_->{value}); 
          push @sects, $sdata if $sdata;
        } else {
          $del = $_->{value};
        }
      }
      push @data, join $del, @sects;
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
      if ($ind eq ' ') {
        $ind = 0;
      }
      if ($ind > 0 && length($out) > $ind) {
        $out = substr($out, $ind);
      }
    } elsif ($_ eq 'set_identifier_type_id_by_name') {
      my $name = $params->{name};
      $out = $refdata->{identifierTypes}->{$name} || '2e8b3b6c-0e7d-4e48-bca2-b0b23b376af5' 
    } elsif ($_ eq 'set_authority_note_type_id') {
      my $name = $params->{name};
      $out = $refdata->{authorityNoteTypes}->{$name} || '76c74801-afec-45a0-aad7-3ff23591e147' 
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
      $out = $refdata->{alternativeTitleTypes}->{$name} || $refdata->{alternativeTitleTypes}->{'Other title'} or die "Can't find alternativeTitleType for $name";
    } elsif ($_ eq 'set_classification_type_id') {
      my $name = $params->{name};
      $out = $refdata->{classificationTypes}->{$name} or die "Can't find classificationType for $name";
    } elsif ($_ eq 'set_instance_format_id') {
      $out = $refdata->{instanceFormats}->{$out} || '';
    } elsif ($_ eq 'capitalize') {
      $out = ucfirst $out;
    } elsif ($_ eq 'char_select') {
      my $from = $params->{from};
      my $to = $params->{to};
      my $len = $to - $from;
      if (length($out) > $from) {
        $out = substr($out, $from, $len);
      }
    } elsif ($_ eq 'set_instance_type_id') {
      if ($field->tag() gt '009') {
        my $code = $field->subfield('b');
        $out = $refdata->{instanceTypes}->{$code};
      } else {
        $out = '';
      }
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
    } elsif ($_ eq 'set_note_staff_only_via_indicator') {
      if ($field->indicator(1) eq '1') {
        $out = 'false';
      } else {
        $out = 'true';
      }
    }
  }
  return $out;
}

my $mapping_rules = getRules($rules_file);

my $ftypes = {
  id => 'string',
  identifiers => 'array.object',
  hrid => 'string',
  source => 'string',
  personalName => 'string',
  personalNameTitle => 'string',
  coporateName => 'string',
  coporateNameTitle => 'string',
  meetingName => 'string',
  meetingNameTitle => 'string',
  topicalTerm => 'string',
  geographicName => 'string',
  genreTerm => 'string',
  sftPersonalName => 'array',
  sftPersonalNameTitle => 'array',
  sftCoporateName => 'array',
  sftCorporateNameTitle => 'array',
  sftMeetingName => 'array',
  sftMeetingNameTitle => 'array',
  sftUniformTitle => 'array',
  sftTopicalTerm => 'array',
  sftGeographicName => 'array',
  sftGenreTerm => 'array',
  saftPersonalName => 'array',
  saftPersonalNameTitle => 'array',
  saftCorporateName => 'array',
  saftCorporateNameTitle => 'array',
  saftMeetingName => 'array',
  saftMeetingNameTitle => 'array',
  saftUniformTitle => 'array',
  saftTopicalTerm => 'array',
  saftGeographicName => 'array',
  saftGenreTerm => 'array',
  notes => 'array.object'
};

my $field_replace = {};
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
    if ($_->{fieldReplacementBy3Digits}) {
      my $frules = {};
      foreach (@{ $_->{fieldReplacementRule} }) {
        $frules->{$_->{sourceDigits}} = $_->{targetField};
      }
      $_->{frules} = $frules;
      $field_replace->{$rtag} = $_;
      delete $mapping_rules->{$rtag};
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
  
  my $count = 0;
  my $start = time();

  my $dir = dirname($infile);
  my $fn = basename($infile, '.mrc', '.marc', '.out');

  my $paths = {};
  foreach (keys %{ $files }) {
    my $suf = $files->{$_};
    my $save_file = "$dir/$fn-$suf";
    unlink $save_file;
    $paths->{$_} = $save_file;
  }

  my $snapshot_id = make_snapshot($paths->{snap});
  
  # open a collection of raw marc records
  $/ = "\x1D";
 
  open RAW, "<:encoding(UTF-8)", $infile;
  open my $OUT, ">>:encoding(UTF-8)", $paths->{auth};
  open my $SRSOUT, ">>:encoding(UTF-8)", $paths->{srs};
  my $inst_recs;
  my $srs_recs;
  my $success = 0;
  my $hrids = {};
  my $rec;
  while (<RAW>) {
    my $raw = $_;
      $rec = {
        source => 'MARC'
      };
      $count++;
      my $marc = eval {
        MARC::Record->new_from_usmarc($raw);
      };
      next unless $marc;
      my $hrid = $marc->field('001')->data();
      my $nid = $hrid;
      # $nid =~ s/ //g;
      $marc->field('001')->data($nid);
      my $f008 = $marc->field('008')->data();
      $f008 .= " " x 40;
      $f008 = substr($f008, 0, 40);
      $marc->field('008')->data($f008);

      my $srsmarc = $marc;
      my $ldr = $marc->leader();
      my @marc_fields = $marc->fields();
      MARC_FIELD: foreach my $field (@marc_fields) {
        my $tag = $field->tag();
        my $fr = $field_replace->{$tag} || '';
        if ($fr) {
          my $sf = $fr->{subfield}[0];
          my $sdata = $field->subfield($sf) || next;
          $sdata =~ s/^(\d{3}).*/$1/;
          my $rtag = $fr->{frules}->{$sdata} || $sdata;
          if ($rtag =~ /^\d\d\d$/) {
            $field->set_tag($rtag);
            push @marc_fields, $field;
          }
          next;
        }
        
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
              my @ncode = [''];
              if ($subs[$i]) {
                @ncode = @{ $subs[$i] };
              }
              push @marc_fields, $new_field if (index($all_codes, $ncode[0]) != -1 && $new_field->{_tag}) || !$ncode[0];
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
      
      $rec->{id} = uuid($hrid);
      $rec->{_version} = $ver;
      $rec->{naturalId} = $nid;
      $inst_recs .= $json->encode($rec) . "\n";
      $srs_recs .= $json->encode(make_srs($srsmarc, $raw, $rec->{id}, $nid, $snapshot_id)) . "\n";
      $hrids->{$hrid} = 1;
      $success++;
    }
    if (eof RAW || $success % 10000 == 0) {
      my $tt = time() - $start;
      print "Processed #$count (" . $rec->{hrid} . ") [ recs: $success, time: $tt secs ]\n" if $rec->{hrid};
      write_objects($OUT, $inst_recs);
      $inst_recs = '';

      write_objects($SRSOUT, $srs_recs);
      $srs_recs = '';
  }
  my $tt = time() - $start;
  print "\nDone!\n$count Marc records processed in $tt seconds";
  print "\nInstances:   $success ($paths->{auth})";
}

sub make_notes {
  my $marc = shift;
  my $tag = shift;
  my $subs = shift;
  my $type = shift || 'Note';
  my $staff = shift;
  my @notes;
  foreach ($marc->field($tag)) {
    my $text = $_->as_string($subs);
    if ($text) {
      my $n = {};
      $n->{note} = $text;
      $n->{holdingsNoteTypeId} = $refdata->{holdingsNoteTypes}->{$type};
      if ($staff) {
        $n->{staffOnly} = JSON::true;
      } else {
        $n->{staffOnly} = JSON::false;
      }
      push @notes, $n;
    }
  }
  return @notes;
}

sub write_objects {
  my $fh = shift;
  my $recs = shift;
  print $fh $recs if $recs;
}

sub make_snapshot {
  my $snap_path = shift;
  my @t = localtime();
  my $dt = sprintf("%4s-%02d-%02d", $t[5] + 1900, $t[4] + 1, $t[3]);
  my $snap_id = uuid($dt);
  my $snap = {
    jobExecutionId=>$snap_id,
    status=>"COMMITTED",
    processingStartedDate=>"${dt}T00:00:00"
  };
  print "Saving snapshot object to $snap_path...\n";
  open SNOUT, ">$snap_path";
  print SNOUT JSON->new->encode($snap) . "\n";
  close SNOUT;
  return $snap_id;
}

sub make_srs {
    my $marc = shift;
    my $raw = shift;
    my $iid = shift;
    my $hrid = shift;
    my $snap_id = shift;
    my $srs = {};

    my $mij = MARC::Record::MiJ->to_mij($marc);
    my $parsed = decode_json($mij);
    
    $srs->{id} = uuid($iid . 'srs');
    my $nine = {};
    $nine->{'999'} = { subfields=>[ { 'i'=>$iid }, { 's'=>$srs->{id} } ] };
    $nine->{'999'}->{'ind1'} = 'f';
    $nine->{'999'}->{'ind2'} = 'f';
    push @{ $parsed->{fields} }, $nine;
    $srs->{snapshotId} = $snap_id;
    $srs->{matchedId} = $srs->{id};
    $srs->{generation} = 0;
    $srs->{rawRecord} = { id=>$srs->{id}, content=>$raw };
    $srs->{parsedRecord} = { id=>$srs->{id}, content=>$parsed };
    $srs->{externalIdsHolder} = { authorityId=>$iid, authorityHrid=>$hrid };
    $srs->{recordType} = 'MARC_AUTHORITY';
    return $srs;
}
