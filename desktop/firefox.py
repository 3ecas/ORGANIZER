"""
Organizer — the window, when Firefox is holding it.

Firefox has no "app mode" the way Chrome does, so this makes one: a
profile of its own with the tab strip and the address bar hidden by a
stylesheet. What's left is the page and an ordinary title bar, which
reads as a window rather than as a browser.

The title bar is kept on purpose. Hiding the tab strip on macOS takes
the title bar with it, and with it go the close button and the only
place you can grab to move the window — so `browser.tabs.inTitlebar`
puts the real one back. Measured: 84px of browser chrome becomes 32px
of plain title bar.

WHERE THIS LIVES, AND WHY NOT IN THE ORGANIZER FOLDER
    A Firefox profile is a set of databases held open by a running
    program. The Organizer folder is synced between the Mac and the PC,
    and syncing a profile while it's in use is one of the surer ways to
    corrupt one. So the profile stays on the machine it belongs to,
    beside the browser's own — nothing here is worth syncing anyway, and
    losing it costs one relaunch.

IF A FIREFOX UPDATE EVER UNDOES THIS
    The toolbars come back. That is the whole failure: the app still
    works, it just looks like a browser again. The fix is to check the
    element names below against a current Firefox.
"""

import os
import sys

# ============================================================
#  WHERE IT LIVES
# ============================================================
def support_dir() -> str:
    """This machine's own corner for Organizer's throwaway state."""
    if sys.platform == "darwin":
        return os.path.expanduser("~/Library/Application Support/Organizer")
    if os.name == "nt":
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        return os.path.join(base, "Organizer")
    return os.path.expanduser("~/.local/share/Organizer")


def profile_dir() -> str:
    return os.path.join(support_dir(), "window-profile")


# ============================================================
#  WHAT MAKES IT A WINDOW
# ============================================================

# Written fresh on every launch. user.js is re-read at every startup and
# overrides whatever the browser saved last time, so a Firefox update
# can't quietly drift any of this back.
PREFS = {
    # Without this the stylesheet below is ignored entirely.
    "toolkit.legacyUserProfileCustomizations.stylesheets": True,

    # Keep a real title bar once the tab strip is hidden — see above.
    "browser.tabs.inTitlebar": 0,

    # None of the first-run furniture belongs in a window that is
    # supposed to be one app: no welcome tour, no "what's new" page
    # after an update, no offer to become the default browser.
    "browser.aboutwelcome.enabled": False,
    "browser.startup.homepage_override.mstone": "ignore",
    "browser.shell.checkDefaultBrowser": False,
    "datareporting.policy.dataSubmissionEnabled": False,

    # The restore-session bar would sit in the hidden toolbar where it
    # can't be clicked, so make sure it's never offered.
    "browser.sessionstore.resume_from_crash": False,
    "browser.tabs.warnOnClose": False,
}

# Firefox's own furniture, by name. Hidden rather than removed, because
# collapsing is reversible and leaves the browser working underneath.
CHROME_CSS = """/* Organizer — hide the browser, keep the page.

   Written by desktop/firefox.py on every launch; edits here are lost.
   #TabsToolbar     the tab strip
   #nav-bar         the address bar and its buttons
   #PersonalToolbar the bookmarks bar                                  */

#TabsToolbar,
#nav-bar,
#PersonalToolbar { visibility: collapse !important; }
"""


def _as_pref(value) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    return '"{}"'.format(str(value).replace('"', '\\"'))


def ensure() -> str:
    """Lay out the profile and return its path. Safe to call every time."""
    profile = profile_dir()
    os.makedirs(os.path.join(profile, "chrome"), exist_ok=True)

    lines = ["// Written by Organizer on every launch. Edits here are lost.\n"]
    lines += [f'user_pref("{k}", {_as_pref(v)});\n' for k, v in PREFS.items()]
    with open(os.path.join(profile, "user.js"), "w", encoding="utf-8") as fh:
        fh.writelines(lines)

    with open(os.path.join(profile, "chrome", "userChrome.css"), "w", encoding="utf-8") as fh:
        fh.write(CHROME_CSS)

    return profile
