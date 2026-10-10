# Announcer recordings

Drop one audio file per announcer line here, named by the line's id: `goal-01.mp3`,
`save-03.mp3`, and so on (`.ogg` and `.wav` work too; if a line has more than one, MP3
wins). Each line can also have an angry take, `<id>-against.mp3` (`goal-01-against.mp3`),
played when the moment favors the opponent. The full list of ids, lines, and delivery notes
is in `docs/ANNOUNCER_SCRIPT.md`.

The game picks up whatever is here at build time. A line without a recording just shows
its text. Commit the files and push, and they're in the next deploy.

File specs: mono, 44.1 or 48 kHz, MP3 at 96–128 kbps, trimmed tight (no more than about
50 ms of silence at either end), peaks around −1 dBFS, all lines at a similar loudness.
