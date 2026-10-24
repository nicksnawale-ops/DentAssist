"""Command-line jobs.

    python -m app.jobs run-reminders    # send due WhatsApp reminders once (for cron)
"""

import sys

from app.core.database import SessionLocal
from app.services.messaging import run_due_reminders


def main(argv: list[str]) -> int:
    if argv[:1] != ["run-reminders"]:
        print(__doc__)
        return 2
    with SessionLocal() as db:
        print(run_due_reminders(db))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
