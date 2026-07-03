# agentwatch demo — render with:  vhs docs/demo.tape   (https://github.com/charmbracelet/vhs)
# First build the sample data:  node docs/build-demo-fixture.mjs   (creates ~/agentwatch-demo)
# Runs the live TUI against that synthetic transcript root — no real data.
# The hidden PATH tweak drops /bin (where macOS keeps `ps`) so liveness detection is skipped —
# otherwise the synthetic "awaiting you"/"stalled" rows would be cross-checked against the real
# process table and demoted to "ended". Recorded on macOS; on Linux `ps` lives in /usr/bin.
Output docs/demo.gif

Set FontSize 15
Set Width 1200
Set Height 380
Set Padding 24
Set Theme "Dracula"
Set TypingSpeed 45ms

Hide
Type "export PATH=$(dirname $(command -v node)):/usr/bin"
Enter
Type "clear"
Enter
Show

Type "node bin/agentwatch.js --all --root ~/agentwatch-demo"
Sleep 500ms
Enter
Sleep 5s
Type "q"
Sleep 800ms
