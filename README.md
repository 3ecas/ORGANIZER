# Organizer

A calendar and task manager that runs entirely on this Mac. No account, no
internet, no subscription, no cloud. Everything it knows lives in this folder.

---

## Start it

**Double-click `start.command`.**

A Terminal window opens and your browser follows. Keep the Terminal window open
while you work; closing it quits the app.

The first time, macOS may refuse to run it. Right-click the file, choose *Open*,
confirm once, and it won't ask again.

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

### Tasks that aren't scheduled yet

Type in the box at the top of the sidebar and press Return. It lands in
**Unscheduled** — the pile for work you know about but can't place yet.
When a date firms up, **drag it onto the calendar**. Drag it back to the
sidebar to unschedule it again.

### On the calendar

- **Drag** a task to move it. It snaps to 15 minutes.
- **Drag the bottom edge** of a block to change how long it is.
- **Double-click** empty space to create a task right there.
- **Click** any task to open it.
- All-day work sits in the strip above the hours, and can **run across several
  days** — see below.

### When a day gets crowded

Tasks at the same time sit side by side. Rather than splitting one narrow
column between them and squeezing every one, **the day itself gets wider** —
enough for each to stay readable — and the week pans sideways. The dates, the
all-day strip and the hour grid scroll together, so they can't fall out of
line, and your position is kept when anything redraws.

A task's name always stays on **one line**, cut short with an ellipsis if it
has to be; the full title is in the hover preview and in the card. Names wrapping
into a paragraph inside a 40-minute block were unreadable and pushed the times
out of sight.

Quiet days keep sharing the width evenly, so an ordinary week looks exactly as
it did — nothing moves until a day actually needs the room.

### The board

**Board** has its own button in the top bar, between the search box and the
Day/Week/Month/Year switch. Press it again (or `5`) to drop back to whichever
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
straight away: set a date on a card and it appears on the calendar; log hours
on the calendar and the card shows them.

The **Done** list is special — dragging a card into it ticks the task complete,
and it shows struck through on the calendar. Ticking the checkbox anywhere does
the same in reverse and pulls the card into Done. Drag it back out to reopen it.

Cards don't disappear when you tick *Hide completed* — that would empty the
Done list and make the board look broken. It only affects the calendar views.

### The task list inside a card

A card is the *job*; the task list is **what actually has to be done on it**.
Open any card and it sits just under the client label.

On a videoclip that might be: mark the beats → moodboard → storyboard →
animate → type treatment → grade and export.

- Type in **Add a step…** and press Return. The box stays focused, so you can
  reel off a whole list in one go.
- **Return** inside a step inserts a new one right below it.
- **Backspace** on an empty step deletes it and jumps back to the one above.
- Clear a step's text and click away and it's gone.
- **Drag the ⠿ handle** to reorder.
- **Clear done** sweeps out the finished ones.

On the **board** the whole list shows on the card, with tickable boxes and a
progress bar — so you can see what's left and cross things off without opening
anything. In the sidebar it's condensed to a **3/6** badge.

A card's list is recorded on the card itself, so reordering the lists never
moves a card between them.

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
the first attached image, when it is, the deadline, hours logged, what's left on
the task list, the start of the notes, and which space, list and client it
belongs to.

It's a full second on purpose, so it never fires while you're just moving the
mouse across the screen, and it goes away the moment you move off, click, drag
or scroll.

### The task window

Opens in two halves:

- **Left — everything about the job.** Which **space** and **board list** it's
  in, the **client label**, the **task list**, whether it's on the calendar, the **date**
  with either a **start and end time** or a **last day**, the **due date**, the
  **hours you've spent**, and notes.
- **Right — the files.** Drag them straight in from Finder, paste a screenshot,
  or click *Attach*. Images, video, audio, PDFs and text preview inline;
  anything else gets an icon plus *Open* and *Save as…*. Under the preview it
  tells you which folder the copy went into.

### Start and end times

A scheduled task has a **start** and an **end** — set both and the block on the
calendar sizes itself to match. Dragging the bottom edge of a block on the
calendar changes the end time, and vice versa; they're the same thing.

An end time at or before the start gets nudged to fifteen minutes, since the
calendar draws one day at a time and can't show an overnight block properly.

### Jobs that run across days

Turn on **All day / no fixed time** and a **Last day** field appears. Set it and
the job shows in the all-day row on *every* day it covers — a four-day shoot
reads as one continuous bar across Monday to Thursday, in the week view and in
the month view.

- **Drag it and the whole run moves**, keeping its length. Same if you change
  the first date in the card — it slides, it doesn't stretch.
- **To make it longer or shorter**, change the Last day. **×** puts it back to a
  single day.
- **Drop it on a time slot** and it becomes an ordinary timed block on that one
  day — it says so when it happens, so it isn't a silent change.
- A last day before the first is treated as a typo and cleared, not as a run
  going backwards.

Only all-day work can run across days. A task with a clock time is a block, and
a block belongs to one day — so the two fields swap places rather than stacking
up, and setting one clears the other.

### Tracking hours

Hit **Start** for a stopwatch, or **+15m / +30m / +1h** to log time you already
spent. A running timer shows in the top bar wherever you are, and keeps counting
even if you close the browser — it picks up where it left off.

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
- In the **sidebar**, clicking a row filters instead: it hides everything
  carrying that label so you can focus, and clicking again brings it back. The
  counts are per space.

With a lot of clients the sidebar list scrolls rather than squeezing the
Unscheduled pile.

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
| `←` `→` | Previous / next period (calendar views) |
| `T` | Today |
| `/` | Search |
| `Esc` | Close the task window |
| `⌘S` | Export a backup |

---

## How it's built

Plain HTML, CSS and JavaScript plus one small Python file. No frameworks, no
build step, no dependencies — open any file and edit it.

```
index.html            markup + the script tags, in load order
start.command         the launcher you double-click
server.py             serves the folder and handles saving to disk
css/
  tokens.css          colours, spacing, light/dark themes
  base.css            buttons, inputs, toggles, pills
  layout.css          app shell and top bar
  spaces.css          the Work / Personal switch
  sidebar.css         quick-add, unscheduled list, labels
  calendar.css        day/week grid, month grid, year overview
  board.css           lists and cards
  editor.css          the two-pane task window
  checklist.css       the task list inside a card
  labels.css          the client-label picker
  hover.css           the hover preview
js/
  core/
    util.js           dates, formatting, colour maths, event bus
    palette.js        the colour swatches and the starter labels
    spaces.js         the two work areas
    files.js          attachment storage (disk / browser / memory)
    store.js          the task model, filters, saving
    backup.js         .organizer export / import
  ui/
    dnd.js            dragging and resizing, incl. board lists
    chips.js          the three task visuals
    timer.js          stopwatch and hour logging
    preview.js        thumbnails and file preview
    checklist.js      the task list inside a card
    labels.js         client labels: stripes, picker, editor
    hover.js          the preview shown on resting a task
    editor.js         the task window
    spaceswitch.js    the Work / Personal switch
    sidebar.js        sidebar rendering
  views/
    grid.js           time-grid geometry and overlap packing
    day-week.js       day and week
    month.js          month
    year.js           year
    board.js          lists of cards
  app.js              boot, top bar, keyboard, render
```

`server.py` binds to `127.0.0.1` only, so nothing outside this Mac can reach it.
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
