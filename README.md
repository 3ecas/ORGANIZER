# Organizer

A calendar and task manager that runs entirely on this Mac. No account, no
internet, no subscription, no cloud. Everything it knows lives in this folder.

---

## Start it

**Double-click `Organizer.app`** — or `Organizer.bat` on the PC.

The app opens in a window of its own: no tabs, no address bar, no Terminal
window to keep out of the way. Quit the window and everything behind it stops.

The first time, macOS may refuse to run it. Right-click the file, choose *Open*,
confirm once, and it won't ask again.

### What that window actually is

Firefox with its tab strip and address bar hidden — 84 pixels of browser
reduced to a 32-pixel title bar, which is just enough to drag the window and
close it.

It stays a real browser on purpose. The app asks for a confirmation dialog in
seven places before it deletes anything, opens two file pickers, and saves
backups through download links. A hand-built window would have to reimplement
all three, and every one of them is somewhere a silent gap could open up later.

On a PC without Firefox it uses Edge's app mode instead, which amounts to the
same window and comes with Windows.

The Firefox profile it uses is kept beside Firefox's own, **not** in this
folder. A profile is a set of databases held open by a running program, and
this folder gets synced between two machines — syncing one while it's in use
is a good way to corrupt it. Nothing in there is worth keeping anyway; losing
it costs one relaunch.

If a Firefox update ever puts the toolbars back, nothing breaks — it just looks
like a browser again. `desktop/firefox.py` is the file to fix.

Want your own icon on it: select `Organizer.app`, press <kbd>⌘I</kbd>, and drag
an image onto the small icon at the top left.

### start.command opens the same window

`start.command` and `start.bat` now do exactly what `Organizer.app` does — the
one difference is that they leave a Terminal window open behind the app, and
closing it quits. Use them if you like seeing what's going on; use
`Organizer.app` if you'd rather not have the extra window.

For an ordinary browser tab instead of a window, run either from a terminal
with `--tab`:

```
./start.command --tab
```

Worth having as something you can ask for rather than only as what you get when
the window fails.

Starting it twice is fine. The launcher asks whether this folder is already
being served before it starts anything, and if it is, it opens another window
onto what's already running instead of a second copy.

> Don't open `index.html` directly. The app still loads, but it can't reach the
> folder — your work would be trapped inside the browser instead, and imported
> files wouldn't be copied anywhere. A yellow banner warns you if this happens.

---

## Everything lives in this folder

```
ORGANIZER/
├── data.json                     all your tasks, hours, notes, due dates
└── FILES/
    ├── Work/
    │   ├── Nightdrive/           one folder per project
    │   │   ├── storyboard_v3.png
    │   │   └── client_brief.pdf
    │   └── Bank ad/
    │       └── ref_footage.mp4
    └── Personal/
        └── Learn Houdini/
            └── pyro_notes.pdf
```

**`data.json`** is written every time you change something. It's plain text —
you can open it, read it, and it's small.

**`FILES/`** is where imported files go: **a folder per space, then a folder per
project**. The project folder is named after the card's title, so
`Videoclip — "Nightdrive"` gets its own folder and everything for that job lands
together. Filenames are kept exactly as they were — no date prefixes, no
renaming.

Your original file is never moved, renamed or touched — Organizer only ever
makes a copy.

To back the whole thing up, copy the ORGANIZER folder. That's it — there is no
hidden database anywhere else.

### The folder follows the card

**Rename a card and its folder follows.** Change the title, close the card, and
any attachments move into a folder matching the new name; the old empty folder
is tidied away. **Move a card to the other space** and its files move too, from
`FILES/Work/…` to `FILES/Personal/…` or back.

Renames happen when you close the card, not while you type — otherwise a
half-typed title would leave junk folders behind. If a move ever fails the file
stays put and keeps working; nothing is lost either way.

The two space folders themselves always stay, even when empty, so `FILES/` shows
both work areas from the first run.

### Removing a file

Removing an attachment from a task **deletes Organizer's copy** in `FILES/`.
It does not touch the original wherever you got it from. You'll be asked to
confirm, and told the exact path first.

---

## Using it on more than one computer

Organizer runs from a folder, so **putting that folder in a synced drive is all
it takes**: Dropbox, OneDrive, Google Drive or iCloud Drive. Put the whole
ORGANIZER folder in it, and every machine sees the same tasks and the same
attachments. It works from anywhere, and no machine has to be left switched on.

**On a PC, double-click `start.bat` instead of `start.command`.** It's the same
thing for Windows. Windows doesn't ship with Python, so the first time you'll
need it from [python.org](https://www.python.org/downloads/) — tick *Add Python
to PATH* during the install, that box matters. `start.bat` tells you if it's
missing.

### The one rule: one computer at a time

Everything lives in a single `data.json`. Two machines editing it at once can't
be merged — so close Organizer on one before opening it on the other, and give
the sync a moment to finish.

**If you forget, nothing is lost.** Each save stamps the file with a revision
number and the name of the machine that wrote it. If another computer has saved
since the copy you have open was loaded, the save is refused rather than
overwriting their work, and a red bar appears:

> **Another device saved first.** BERNIE-PC saved this folder at 09:11 while it
> was open here. Nothing more will be saved on this computer until you reload —
> that picks up their version. Export first if you've changed things here.

Nothing more is written from that machine until you reload, so the other
computer's work stays intact. **Export** takes a backup of whatever is on screen
first, so you can put it back by hand if you'd made changes worth keeping.

### Worth knowing

- **Attachments count against your sync quota.** A folder of ProRes masters will
  fill a free Dropbox fast. Keep heavy source media outside Organizer and attach
  stills, PDFs and web cuts.
- **Your data sits on their servers.** That's the trade for reaching it from
  anywhere. If that's not acceptable for a given client's material, keep that
  work in a second copy of the folder outside the synced drive.
- **It's a git repo too.** `git commit` before you switch machines gives you a
  second net — that's how the files got back the one time they were deleted.

### Finished work: the archive

Ticking something complete doesn't get it out of the way — over a year of
client jobs the Done list and the search results fill up with work you finished
months ago.

**Archive** does get it out of the way, without destroying anything. The task,
its hours, its checklist and its files all stay in `data.json`; they just stop
appearing in the calendar, the board, the wall and search.

- **Archive a single card** from the box icon in its header.
- **Archive the whole Done list** from the *Archive* action on that column.
- The **archive button in the top bar** shows how many are put away.
- **Restore** puts one back in play. Deleting from there is the only thing in
  Organizer that really destroys a task, and it says so before it does.

**Finding something in there.** It opens as one flat list, newest first, with
its own search box and a row of client chips.

- **The search box** is the archive's own, not the one in the top bar — hunting
  through finished work shouldn't disturb the view you were on. It looks at
  titles, subtitles, notes, client names, task steps and file names, so *"galp"*
  or *"endframe"* both find things. It takes the cursor as soon as the archive
  opens, so you can just start typing.
- **The client chips** are built from what's actually in the archive: a client
  with nothing archived doesn't get a chip. Click one to see only that client's
  work, click several to see several, click *All* to clear. The header counts
  along — *"3 of 41"*.
- **Anything with no client gets a "No label" chip** at the end of the row,
  with a dashed dot instead of a colour. It's a leftover rather than a client,
  so it sorts last, and it only appears if there's actually something in it.
- **Escape** clears the search box first and only closes the archive once it's
  empty, so a search is never one keypress away from losing the whole sheet.

The chip row hides itself entirely when everything in the archive shares one
client — there'd be nothing to choose between.

### The Export button

**Export** (or `⌘S`) writes a single `.organizer` file containing everything —
tasks *and* every attached file at full quality. Handy for moving to another
machine or keeping a dated snapshot on a drive. **Import** restores one.

Copying the folder and exporting do the same job; use whichever suits you.

---

## Using it

### Work and Personal

Two separate work areas, switched at the top of the sidebar (or with `S`).
**Nothing crosses between them.** Each space has its own tasks, its own
calendar, its own board lists and its own folder under `FILES/`.

The whole app changes colour with the space — **violet for Work, teal for
Personal** — so you always know which one you're looking at before you read
anything.

- **New tasks land in the space you're in.** So does anything you quick-add.
- **Search only looks in the space you're in**, but the *other* button shows how
  many matches are over there. Nothing can go missing just because it's filed on
  the other side.
- **To move a task across**, open it and change **Space** at the top left. Its
  attachments move with it, and it lands at the top of the matching list on the
  other board.

The client labels are shared — the same list in both — but their counts are
per space.

### Searching

Both search boxes — the one in the top bar and the archive's own — read the
same way. **A query is split on the spaces and every part has to match**, so
typing two things narrows rather than widens.

**Dates count as a search term.** Type `16 september` and you get every job you
were on that day — including one that runs from the 14th to the 18th, because
the 16th is a day you were working on it. All of these mean the same thing:

```
16 september     september 16     16 sep     16 setembro
16/09/2026       16/09            2026-09-16
```

And the looser ones:

| Type | Finds |
|---|---|
| `september` | everything in any September |
| `2026` | everything that year |
| `today` `yesterday` `tomorrow` | that day |
| `14:00` `2pm` `9h` | jobs running at that time of day |

A date matches a job's **run of days** and its **due date**. It does *not*
match the day something was archived — filing work away isn't a day you worked
on it, and an afternoon spent tidying would otherwise stamp thirty old jobs
with the same date.

**Crossing terms is the point.** `galp 16 september` is Galp work on the 16th,
not everything Galp plus everything on the 16th. In the archive you can cross a
client chip with a date the same way.

Anything that isn't a date or a time stays plain text, matched against the
title, subtitle, notes, client name, task steps and file names. So `v16` and a
bare `16` behave as they always did rather than being quietly read as the
sixteenth — a version number shouldn't become a date because it looks like one.

### Dragging

**You drag the card itself.** It lifts off the page, wobbles gently, and keeps
its own size and contents the whole way, so you can still read what you're
moving and where it will fit. There's no stand-in pill following the cursor —
that told you less than the card does.

It works the same everywhere: the board, the timeline, the to-do wall and the
sidebar list. Let go somewhere that isn't a drop target and the card goes back
exactly as it was. The wobble stops if your Mac is set to reduce motion.

### Tasks that aren't scheduled yet

Type in the box at the top of the sidebar and press Return. It lands in
**Unscheduled** — the pile for work you know about but can't place yet.
When a date firms up, **drag it onto the calendar**. Drag it back to the
sidebar to unschedule it again.

### On the calendar

Day and Week run **left to right**. Time is the horizontal axis and every task
is a bar; bars stack down the page only where they'd otherwise collide.

It used to be a vertical hour grid, which is built for appointments — an hour
tall, an hour's work. A project that runs for a fortnight has no honest shape
in that, and a bar has both: its **length** says how long, and there's room
**along** it to actually read what the thing is.

- **Drag a bar** to move it — sideways through time, up and down between lanes,
  in one gesture.
- **Lanes are yours.** Drop a bar on any row and that's where it stays, even if
  something is already there and they overlap. Nothing gets re-packed behind
  your back.
- **A row is a fact about the job**, not about the week you're looking at. A bar
  sits on the same row in Day, Week and Timeline, and is still there after you
  page away and back. Bars you've never placed take the first free row the first
  time they're drawn, and keep it.
- **You can drop onto ground that's already occupied.** Letting go on top of
  another bar puts yours there; it doesn't refuse.
- Drag one to the sidebar and it comes off the schedule — it says so when that
  happens, because it's easy to do by accident on the way past.
- **Drag either end** to stretch or shrink it. In Week that's the first or last
  day of a run; in Day it's the start time or the length, snapped to quarter
  hours. Pulling the left end leaves the far end where it was.
- **Double-click** empty space to put something there.
- **Click** any bar to open it.

There are three ranges. **Day** is hours across, so a bar's length is its real
duration. **Week** is seven day-columns and a bar covers whole days. **Timeline**
— its own button next to Board, or `7` — is **eight weeks** for seeing the shape
of a season rather than a week.

**Everything a bar says is drawn inside the bar.** A short one cuts its name
short rather than spilling it into the lane, where it would read as a separate
empty row and could land on top of a neighbour. Hover it for the full picture.

Week — at an hour's resolution a
90-minute job would be fifteen pixels wide, which is the unreadable sliver the
old grid already was. The clock time is printed on the bar instead.

A bar is **two lines tall**: the name on the first, with the whole width to
itself, and the time, subtitle and deadline sharing the second as they fit.
Before that they all competed for one strip and the title lost — which was the
complaint about the vertical grid, just turned on its side.

**The name travels with you.** Scroll into the afternoon and a job that runs all
day doesn't become an unlabelled slab; its name slides along the bar and stops
at the bar's own far end. Rest on any bar for the full picture.

### The board

Press **Board** in the top left, or `5` — again to drop back to whichever
calendar view you came from.

It's the same work seen as lists of cards instead of a calendar.

- **Drag a card** between lists to move it along. A line shows where it'll land.
- **Drag within a list** to reorder.
- **Drag a whole list sideways by its header** to reorder the board. A vertical
  line shows where it'll land, and the board scrolls if you drag past the edge.
  No cards move — the order is only how the board reads.
- **Click the list name** to rename it. *Backlog / In progress / Review / Done*
  are just starting points — rename them to your own stages.
- **+ Add another list** for a new stage. **×** on a list deletes it; its cards
  move to the first list, nothing is lost.
- The first image attached to a card becomes its **cover**.
- **The task list shows on the card**, with a progress bar and tickable boxes —
  tick a step straight from the board without opening anything. A long list
  shows six at a time, starting at the first thing not done yet, so the card
  always shows where you are and what's next.

**Each space has its own lists.** Renaming, reordering, adding or deleting a
list in Work leaves the Personal board exactly as it was.

**It's the same tasks, not a copy.** A card and a calendar block are the same
thing seen two ways, so anything you change in one shows up in the other
on the calendar and the card shows them.

The **Done** list is special — dragging a card into it ticks the task complete,
and it shows struck through on the calendar. Ticking the checkbox anywhere does
the same in reverse and pulls the card into Done. Drag it back out to reopen it.

Cards don't disappear when you tick *Hide completed* — that would empty the
Done list and make the board look broken. It only affects the calendar views.

### The task list inside a card

A card is the *job*; the task list is **what actually has to be done on it**.
Open any card and it's in the right-hand panel.

On a videoclip that might be: mark the beats → moodboard → storyboard →
animate → type treatment → grade and export.

- Type in **Add a step…** and press Return. The box stays focused, so you can
  reel off a whole list in one go.
- **Return** inside a step inserts a new one right below it.
- **Backspace** on an empty step deletes it and jumps back to the one above.
- Clear a step's text and click away and it's gone.
- **Drag the ⠿ handle** to reorder.
- **Clear done** sweeps out the finished ones.

**Groups.** Press **＋ Group** and you get a folder in the list. Drag a step
onto it to put it in; drag it back out to the main list to take it out. Click
the ▸ to fold a group away — handy once a round is finished and you just want
it out of sight. A group heading shows its own **1/3**, and **Return** on the
heading starts a step inside it.

**Groups go inside groups, as deep as the job actually goes.** On a heading,
**＋** adds a step in there and **⊞** adds another group in there. You can drag
a whole group into another one and everything under it travels along. So a job
can be filed the way it's really shaped:

```
30s master
  Round 1
    Animation
      Scene 01 — logo build
      Scene 02 — product turn
    Sound design pass
  Round 2
    Client notes 12/09
6s bumper
  Recut from the master
Deliver to the agency
```

There's still only one kind of list — a plain list is just a list with no
groups in it, so there's nothing to choose between when you make a card.

A group is never "done" itself — it's as done as everything underneath it, all
the way down. So **Round 1** above reads 2/3 while **30s master** reads 2/5,
and the card's own **3/8** counts only the steps, never the headings.

**Deleting a group never takes the work with it.** Its contents move out into
wherever the group was sitting — not up to the top — keeping their own shape,
and it tells you how many steps moved. The × on a heading is safe to press.

The indent is deliberately small and the line down the left is what you read
the nesting from, so going a few levels deep doesn't eat the width you need for
the words.

On the **board** the whole list shows on the card, with tickable boxes and a
progress bar — so you can see what's left and cross things off without opening
anything. Group headings stay out of that summary: on a card you want the work,
not the filing. In the sidebar it's condensed to a **3/9** badge.

A card's board list is recorded on the card itself, so reordering the lists
never moves a card between them.

Ticking every step does *not* complete the task — finishing the work and
calling the job done are two different decisions, so that stays yours.

### The subtitle

Under every project title is a second line — which cut, which deliverable,
which client. It follows the title everywhere: its own line on a board card, a
block in the day grid and the sidebar; alongside the title, dimmed, on a
one-line chip in a month cell.

Press **Return** in the title field to drop into it.

### Resting on a task

Hover anything — a chip, a block, a board card, a sidebar item — and hold still
for **one second**. A preview appears with the whole picture: name and subtitle,
the task list, the start of the notes, and which space, list and client it
belongs to.

It's a full second on purpose, so it never fires while you're just moving the
mouse across the screen, and it goes away the moment you move off, click, drag
or scroll.

### The task window

Opens in two halves, split by what each side is *for*.

**Left — the facts.** Short, fixed, no scrolling: which **space** and **board
list** it's in, the **client label**, when it **starts** (day and time), when it
**ends** (day and time), and the **due date**. These are the things you set once
and glance at.

**Right — the work.** Three tabs, each getting the whole pane:

- **Task list** — the steps and groups, as above, with room for the nesting to
  be read. Scrolls on its own; the tabs stay put. This is where a card opens.
- **Notes** — the brief, the feedback, what changed today. The box fills the
  pane, so it's somewhere to actually write rather than a slot to jot in.
- **Files** — drag them straight in from Finder, paste a screenshot, or click
  *Attach*. Images, video, audio, PDFs and text preview inline at a size worth
  looking at; anything else gets an icon plus *Open* and *Save as…*. Under the
  preview it tells you which folder the copy went into. With nothing attached
  the whole pane becomes the drop target.

Each tab carries its own count — **3/8**, **2**, a dot when there are notes —
so you can see what's in the other two without going there.

You can **drop files onto the right pane from any tab**, not just Files; the
whole pane lights up and it switches over once they land.

**A card always opens on the first tab** — Task list, unless you change the
order — so opening one is the same move every time rather than a guess about
where you left off.

**Drag a ⠿ tab** to reorder them, and that order applies to **every card**.
That's also how you choose what a card opens on: whichever tab you put first.
How you read a project is a habit, not a fact about any one job.

### A job has a start and an end

Four fields, two of them dates: **starts on** 16 Sep **at** 14:00, **ends on**
18 Sep **at** 18:00. That's one card, one bar, however many days it covers —
you never make a second card because the work carried on into tomorrow.

The updates that arrive each day go *inside* that card: a step on the task list
for each thing that comes back, and the end date pushed out as the job grows.

- **Dragging the end of a bar** does the same thing. In Week that's the last
  day; in Day it's the clock, snapped to quarter hours.
- **All day** drops the hours and keeps the dates.
- Within a single day the end has to come after the start, and gets nudged if
  it doesn't. Across days it needn't — finishing Friday at 09:00 having begun
  Wednesday at 14:00 is an ordinary week.

Day view draws **08:00 to 22:00**.

### Jobs that run across days

Turn on **All day / no fixed time** and a **Last day** field appears — or just
drag the end of the bar in Week view, which does the same thing. A four-day
shoot is **one bar** from Monday to Thursday, not four copies.

- **Drag it and the whole run moves**, keeping its length. Same if you change
  the first date in the card — it slides, it doesn't stretch.
- **To make it longer or shorter**, change the Last day. **×** puts it back to a
  single day.
- **Stretching a timed job across days drops its clock** — a run of days has no
  start time, and it says so when it happens rather than changing it quietly.
- A last day before the first is treated as a typo and cleared, not as a run
  going backwards.

Only all-day work can run across days. A task with a clock time is a block, and
a block belongs to one day — so the two fields swap places rather than stacking
up, and setting one clears the other.

### Labels — one per client

A **label** is a name with **one to three colours**. Normally it's a client:
*Aurora Records*, *Banco Atlantico*, *Self-promo*. Every task carries one, and
that's what colours it everywhere — the bar on a card, the stripe down a chip,
the tint on a block, the shading in the year view.

Three colours rather than one because nine single colours run out fast once
every client wants its own, and a striped pair still reads as distinct at chip
size. A two-colour label draws as two bands, a three-colour one as three.

**Labels are listed alphabetically** — with any number of clients, the only
order you can predict is the one you'd look them up in. Renaming re-sorts when
you finish typing, not while you type.

**Black and white are in the palette.** They're nudged just far enough off the
background to stay visible: a black label shows as a dark grey on the dark
theme and true black on the light one, and white the other way round. Without
that a black stripe on the dark theme would simply be invisible. Every other
colour is left exactly as you picked it, and the swatch grid always shows the
true colour.

**You can add and edit them in two places** — the *Clients & labels* list in
the sidebar, and the *Client / label* dropdown inside any card. They're the same
list and the same editor, so use whichever you're nearer to.

Inside a card it's a **dropdown**: closed, it shows only the colour and the
client's name, so the card stays about the job. Click it to choose, and picking
one closes it again. `Esc` closes the dropdown before it closes the card.

- **✎** on any label opens it: rename it, and click swatches to add or remove
  colours up to three. A label can't be left with none.
- **🗑** beside the name deletes it. Its tasks move to the first label — it
  never deletes a task, and it tells you how many will move first. The last
  remaining label can't be deleted at all.
- **+ New label** at the bottom adds a client. From inside a card it's assigned
  to that card straight away.
- In the **⚑ menu**, clicking a row filters instead: it hides everything
  carrying that label so you can focus, and clicking again brings it back. A
  dot appears on the flag whenever something is filtered, so you can't leave
  work hidden and forget. The counts are per space.

The menu used to be a permanent panel in the sidebar, which cost a third of it
for something you touch occasionally. The Unscheduled pile has that room now.

Searching matches label names, so typing a client's name finds their work.

---

## Keyboard

| Key | |
|---|---|
| `N` | New task |
| `A` | Jump to quick-add |
| `S` | Switch between Work and Personal |
| `1` `2` `3` `4` | Day / Week / Month / Year |
| `5` | Board (press again to go back) |
| `6` | To do wall (press again to go back) |
| `7` | Timeline — eight weeks (press again to go back) |
| `←` `→` | Previous / next period (calendar views) |
| `T` | Today |
| `/` | Search |
| `\` | Show or hide the sidebar |
| `?` | The list of keys, on screen |
| `Esc` | Close the card — or just the menu inside it |
| `⌘S` | Export a backup |

Press `?` at any time rather than coming back here.

---

## How it's built

Plain HTML, CSS and JavaScript plus one small Python file. No frameworks, no
build step, no dependencies — open any file and edit it.

```
index.html            markup + the script tags, in load order
Organizer.app         double-click this on a Mac — opens it as a window
Organizer.bat         the same, for Windows
launch.py             picks a port, starts the server, opens the window
desktop/
  window.py           finds a browser and opens a window with no browser in it
  firefox.py          the profile that hides Firefox's tabs and address bar
start.command         the same window, with a Terminal behind it
start.bat             the same, for Windows
server.py             serves the folder and handles saving to disk
css/
  tokens.css          colours, spacing, light/dark themes
  base.css            buttons, inputs, toggles, pills
  layout.css          app shell and top bar
  spaces.css          the Work / Personal switch
  sidebar.css         quick-add, unscheduled list, labels
  calendar.css        month grid, year overview
  timeline.css        day and week, along a horizontal axis
  board.css           lists and cards
  todo.css            the to-do wall
  editor.css          the two-pane task window and its tabs
  checklist.css       the task list inside a card
  labels.css          the client-label picker
  hover.css           the hover preview
  sheet.css           the archive and keyboard overlays
js/
  core/
    util.js           dates, formatting, colour maths, event bus
    search.js         what a query means: text, dates, clock times
    palette.js        the colour swatches and the starter labels
    spaces.js         the two work areas
    files.js          attachment storage (disk / browser / memory)
    store.js          the task model, filters, saving
    backup.js         .organizer export / import
  ui/
    dnd.js            dragging and resizing, incl. board lists
    chips.js          the three task visuals
    preview.js        thumbnails and file preview
    checklist.js      the task list inside a card, groups and all
    cardpanel.js      the Notes / Task list / Files tabs
    labels.js         client labels: stripes, picker, editor
    hover.js          the preview shown on resting a task
    archive.js        finished work, put away
    shortcuts.js      the list of keys
    editor.js         the task window
    spaceswitch.js    the Work / Personal switch
    sidebar.js        sidebar rendering
  views/
    grid.js           which hours to draw, and snapping
    timeline.js       day and week, as horizontal bars
    month.js          month
    year.js           year
    board.js          lists of cards
    todo.js           the to-do wall
  app.js              boot, top bar, keyboard, render
```

`server.py` binds to `127.0.0.1` only, so nothing outside the machine running it
can reach it — which is why it needs no password. Syncing the folder does not
change that: each computer still talks only to its own copy.
It exposes five endpoints — read and write `data.json`, save a file, move a file
between folders, delete a file — and nothing else. Names coming from the browser
are stripped of any directory part, space and project names are flattened to a
single safe folder name each, and every path is checked to resolve inside
`FILES/`, so a request can never read or write outside that folder.

Scripts load as ordinary `<script src>` tags rather than ES modules on purpose:
modules are blocked when a page is opened as `file://`, and the app degrades to
browser storage rather than breaking outright.

Modules talk through a small event bus. Anything that changes data calls
`ORG.store.save()`, which persists and emits `change`; `app.js` is the only
thing that listens and repaints. Nothing calls another module's render function
directly.

That bus is why the board and the calendar stay in step without any syncing
code: there is one array of tasks, and every view is just a different way of
drawing it. A board card holds no data of its own — `status` and `order` say
where it sits in a list, and that's all the board adds to a task.

Spaces work the same way. There is still one array of tasks; each carries a
`space` field, and every query in `store.js` filters on the active one. Nothing
is loaded or unloaded when you switch, which is why it's instant.
