#!/usr/bin/env python2

import os
import sys
import json

# Logging
def _getLogger(name):
    """
    Logger configuration helper.
    """
    import logging
    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)
    logger_format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    formatter = logging.Formatter(logger_format)
    ch = logging.StreamHandler()
    ch.setFormatter(formatter)
    ch.setLevel(logging.INFO)
    logger.addHandler(ch)
    return logger
logger = _getLogger(__name__)

# Mutagen
try:
    import mutagen
except ImportError:
    logger.error('mutagen module is required')
    sys.exit(1)

# peewee
try:
    import peewee
    import pwiz
except ImportError:
    logger.error('peewee module is required')
    sys.exit(1)

# Settings
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def get_settings(name):
    """
    Helper returning the settings for the given name, searching for
    <root>/settings/<name>.json and returning its parsed dictionary.
    """
    return json.load(open(os.path.join(root, 'settings', name + '.json')))
settings = { name: get_settings(name)
        for name in ('media', 'watchdog', 'database') }

# Media section

def get_song_metadata(path):
    """
    Get the metadata for a song, given a path (recommended absolute) to
    this song. Returns a dictionary (see key->value pairs below).
    Raises an IOError if the path is invalid or the audio file is bad.
    """
    if not os.path.exists(path):
        raise IOError('File "%s" does not exist' % path)
    file_ = mutagen.File(path)
    if file_ is None:
        raise IOError('Error when reading "%s"' % path)
    def get_id3_tag(key, default=None):
        """
        Get an ID3 tag from "file_" defined above, returning default
        if the key isn't valid (returns a string if valid).
        Keys are ID3 standards (see http://en.wikipedia.org/wiki/ID3)
        """
        id3_keys = {
                'title': 'TIT2',
                'album': 'TALB',
                'artist': 'TPE1',
                'duration': 'TLEN',
                'year': 'TDRC',
                }
        assert key in id3_keys
        try:
            return str(file_[id3_keys[key]])
        except KeyError:
            return default
    return {
            'title': get_id3_tag('title'),
            'artist': get_id3_tag('artist'),
            'album': get_id3_tag('album'),
            'year': get_id3_tag('year'),
            'duration': get_id3_tag('duration'),
            }

def validate_song(song):
    """
    Validation for song dictionary, returning the expected data
    dictionary for the database.
    """
    def validate_integer(number, default=None):
        try:
            number = int(number)
            return number
        except ValueError:
            return default
    validations = (
            ('year', validate_integer),
            ('duration', validate_integer),
            ('play_count', None),
            )
    for field, validator in validations:
        if callable(validator):
            song.pop(field, None)
        elif field in song:
            song[field] = validator(song[field])
    return song

def collect_songs(media_root, extensions):
    """
    Generator expression for collecting songs recursively under the
    given media_root. Yields each song as a dictionary (see the other
    key-value pairs in get_song_metadata above), with "path" the relative
    path to the song file.
    """
    logger.info('collecting all songs in %s' % media_root)
    for root, _, files in os.walk(media_root, followlinks=True):
        for fname in files:
            # check extension
            ext = os.path.splitext(fname)[1].lstrip('.')
            if ext not in extensions:
                continue
            full_fname = os.path.join(root, fname)
            # store relative filename in database
            rel_fname = full_fname[len(media_root) + 1:]
            try:
                song = get_song_metadata(full_fname)
                logger.info('parsed: %s' % rel_fname)
                song['path'] = rel_fname
                yield validate_song(song)
            except IOError:
                logger.warning('error parsing: %s' % rel_fname)

# Database section

database = peewee.MySQLDatabase(settings['database']['name'], **{
    'host': settings['database']['host'],
    'user': settings['database']['user'],
    'passwd': settings['database']['password'],
    })

class Song(peewee.Model):
    """
    Song model, generated with pwiz.py utility.
    TODO: generate this model programmatically when starting the watchdog
    """
    path = peewee.CharField()
    title = peewee.CharField(null=True)
    artist = peewee.CharField(null=True)
    album = peewee.CharField(null=True)
    year = peewee.IntegerField(null=True)
    duration = peewee.IntegerField(null=True)
    play_count = peewee.IntegerField(default=0, db_column='playCount')

    class Meta:
        database = database
        db_table = 'songs'

Song.create_table(fail_silently=True)

# Main section

if __name__ == '__main__':
    # Media root
    media_root = os.path.join(root, settings['media']['path'])

    # Step 1: drop "broken" songs from database
    with database.transaction():
        for song in Song.select():
            full_path = os.path.join(media_root, song.path)
            if not os.path.exists(full_path):
                song.delete_instance()

    # Step 2: search media root for songs and insert them in the database
    for song in collect_songs(media_root, settings['media']['extensions']):
        with database.transaction():
            try:
                song_instance = Song.get(Song.path == song['path'])
                song_instance.update(**song)
            except Song.DoesNotExist:
                song_instance = Song.create(**song)

# vim: ft=python et sw=4 sts=4