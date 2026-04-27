# System packages Replit installs into the workspace + deployment image.
# Modern Replit detects most things from .replit's `modules`, but a few
# binaries are easier to declare here.

{ pkgs }: {
  deps = [
    pkgs.python311
    pkgs.python311Packages.pip
    pkgs.sqlite       # for `sqlite3` REPL inside the Replit shell
    pkgs.gcc          # builds C extensions used by some pinned wheels
  ];
}
