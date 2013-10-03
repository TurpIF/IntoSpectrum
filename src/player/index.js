var Song = require('../models').Song,
    mplayer = require('./mplayer').mplayer;
    youtube = require('./youtube');

var player = module.exports = function() {
  // mplayer
  this._mplayer = new mplayer();
  this._mplayer.start();

  // Current song
  this._current_song = undefined;

  // Playlist
  this._playlist = new Array();
  this._playlist_size = 200;

  // History
  this._history = new Array();
  this._history_size = 100;
};

player.prototype.kill = function(signal) {
  this._mplayer.kill(signal);
};

player.prototype.quit = function(code) {
  this._mplayer.quit(code);
};

player.prototype.song_over = function() {
  return this._mplayer.song_over();
  // return (!isNaN(this._mplayer.time_pos.value)
  //   && !isNaN(this._mplayer.length.value)
  //   && this._mplayer.time_pos.value >= this._mplayer.length.value)
  //   || this._mplayer.filename.value == undefined;
}

player.prototype.get_info = function(callback) {
  var self = this;

  this._mplayer.update(function() {
    var filename =  self._mplayer.get_filename();
    var volume =    self._mplayer.get_volume();
    var length =    self._mplayer.get_length();
    var time_pos =  self._mplayer.get_time_pos();
    var pause =     self._mplayer.get_pause();

    var out = {
      'id': -1,
      'playing': pause ? 0 : 1,
      'volume': volume,
      'time': time_pos,
      'time_max': length,
      'playlist': new Array(),
      'play_count': 0
    };

    for(var i = 0 ; i < self._playlist.length ; i++) {
      out['playlist'].push(self._playlist[i].id);
    }

    if (self._current_song != undefined) {
      out['id'] = self._current_song.id;
      out['play_count'] = self._current_song.playCount;
    }

    if(callback != undefined) {
      callback(out);
    }
  });

  // return out;

  // this._mplayer.filename.get();
  // this._mplayer.volume.get();
  // this._mplayer.time_pos.get();
  // this._mplayer.length.get();
  // this._mplayer.pause.get();

  // var self = this;
  // var wait_out = function() {
  //   if(!self._mplayer.waiting()) {
  //     var out = {
  //       'id': -1,
  //       'playing': self._mplayer.pause.value ? 0 : 1,
  //       'volume': self._mplayer.volume.value,
  //       'time': self._mplayer.time_pos.value,
  //       'time_max': self._mplayer.length.value,
  //       'playlist': new Array(),
  //       'play_count': 0
  //     };

  //     for(var i = 0 ; i < self._playlist.length ; i++) {
  //       out['playlist'].push(self._playlist[i].id);
  //     }

  //     if (self._current_song != undefined) {
  //       out['id'] = self._current_song.id;
  //       out['play_count'] = self._current_song.playCount;
  //     }

  //     if(success) { success(out); }
  //   }
  //   else {
  //     setTimeout(wait_out, 100);
  //   }
  // };
  // wait_out();
};

player.prototype.add_to_playlist = function(id, pos) {
  id = parseInt(id);
  pos = parseInt(pos);
  if(!isNaN(id) && !isNaN(pos)) {
    if(pos < 0 || pos > this._playlist.length)
      pos = this._playlist.length;

    var self = this;
    Song.find(id).success(function(song) {
      if(song) {
        self._playlist.splice(pos, 0, song);
      }
    });
  }
}

player.prototype._play = function(song, from_history) {
  if(song != undefined) {
    var self = this;

    if(from_history == undefined)
      from_history = false;

    if(from_history) {
      this._playlist.unshift(this._current_song);
      if(this._playlist.length > this._playlist_size)
        this._playlist.pop();
    }
    else {
      this._history.push(this._current_song);
      if(this._history.length > this._history_size)
        this._history.shift();
    }

    this._current_song = song;

    var volume = this._mplayer.get_volume();
    if(this._current_song.youtube != undefined) {
      youtube.get_link(this._current_song.youtube, function(url) {
        self._mplayer.loadfile(url, 0, function() {
          self._mplayer.set_volume(volume);
        });
      }, function(err) {
        console.log('Youtube error: ' + err);
      });
    }
    else {
      this._mplayer.loadfile(this._current_song.fullPath(), 0, function() {
        self._mplayer.set_volume(volume);
      });
      this._current_song.playCount += 1;
      this._current_song.save();
    }
    // this._mplayer.set_volume(volume);
  }
};

player.prototype.play_next = function() {
  if(this._playlist.length > 0) {
    this._play(this._playlist.shift());
  }
  else {
    var self = this;
    Song.count().success(function(n) {
      Song.findAll({offset: Math.floor(Math.random() * n),
        limit: 1}).success(function (songs) {
          if(songs.length > 0) { self._play(songs[0]); }
        });
    });
  }
};

player.prototype.play_prev = function() {
  if(this._history.length > 0) {
    this._play(this._history.pop(), true);
  }
  else {
    var self = this;
    Song.count().success(function(n) {
      Song.findAll({offset: Math.floor(Math.random() * n),
        limit: 1}).success(function (songs) {
          if(songs.length > 0 && songs[0]) { self._play(songs[0], true); }
        });
    });
  }
}

player.prototype.play = function(id) {
  id = parseInt(id);
  if(!isNaN(id)) {
    var self = this;
    Song.find(id).success(function(song) {
      if(song != undefined) {
        self._play(song);
      }
    });
  }
};

player.prototype.play_youtube = function(url) {
  if(url != undefined) {
    var song = new Object();
    song.youtube = url;
    this._play(song);
  }
};

player.prototype.pause = function(id) {
  id = parseInt(id);
  if(!isNaN(id)
      && this._current_song != undefined
      && this._current_song.id == id) {
        this._mplayer.force_pause();
      }
}

player.prototype.unpause = function(id) {
  id = parseInt(id);
  if(!isNaN(id)
      && this._current_song != undefined
      && this._current_song.id == id) {
        this._mplayer.force_unpause();
      }
}

player.prototype.stop = function(id) {
  id = parseInt(id);
  if(!isNaN(id)
      && this._current_song != undefined
      && this._current_song.id == id) {
        this._mplayer.force_pause();
        // this._mplayer.time_pos.set(0);
        this._mplayer.set_time_pos(0);
      }
}

player.prototype.volume = function(volume) {
  volume = parseFloat(volume);
  if(!isNaN(volume)
      && volume >= 0 && volume <= 100) {
        // this._mplayer.volume.set(volume);
        this._mplayer.set_volume(volume);
      }
}

player.prototype.time = function(id, time) {
  id = parseInt(id);
  time = parseFloat(time);
  if(!isNaN(id)
      && this._current_song != undefined
      && this._current_song.id == id
      && !isNaN(time)
      && time > 0) {
        // this._mplayer.time_pos.set(time);
        this._mplayer.set_time_pos(time);
      }
}

// vim: ft=javascript et sw=2 sts=2