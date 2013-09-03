$(window).load(function() {
  // Main player instance
  var player = new Player('/player');

  // Load songs protocol (data handler, current cursor, end handler)
  var loadSongs = function(fn, end, c) {
    var cursor = parseInt(c) || 1;
    $.getJSON('/library/' + cursor, function(data) {
      if (data.next) {
        fn(data);
        loadSongs(fn, end, cursor + 1);
      } else { end(); }
    });
  };

  // Load songs
  var loadContainer = $('#library-loading'),
    loadCurrent = $('#library-loading-current');
  loadSongs(function(data) {
    // Append songs to the #library
    var library = $('#library');
    $.each(data.songs, function(_, song) {
      var title = song.title || '',
        artist = song.artist || '',
        album = song.album || '',
        year = song.year || '';

      // Create the DOM element
      var row = $('<tr></tr>');
      row.html(
        '<td song-id="' + song.id + '">' + song.id + '</td>' +
        '<td>' + title      + '</td>' +
        '<td>' + artist     + '</td>' +
        '<td>' + album      + '</td>' +
        '<td>' + year       + '</td>' +
        '<td>' + song.playCount + '</td>'
        );

      // Hook events
      row.on('click', function() {
        player.play($(this).children().first().text());
      });

      // Update the modal's "current" loading
      var songTitle = song.title || song.path;
      loadCurrent.text('Loaded song "' + songTitle + '"');

      // Add to the library container
      library.append(row);
    });
  }, function() {
    // Loading finished
    loadContainer.hide();

    // Player event hooks
    player.on('play', function(song) {
      // Update play count
      $('[song-id="' + song.id + '"]').siblings().last().text(song.playCount);
    }).on('pause', function() {
      // TODO
    }).on('stop', function() {
      // TODO
    });
  });
});

// vim: ft=javascript et sw=2 sts=2
