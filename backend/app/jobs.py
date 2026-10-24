"""Command-line jobs.

    python -m app.jobs run-reminders    # send due WhatsApp reminders once (for cron)
    python -m app.jobs run-recalls      # refresh recalls, send due recalls and review requests
    python -m app.jobs run-leads        # follow-up alerts for enquiries, and move booked ones on
"""

import sys

from app.core.database import SessionLocal
from app.services.messaging import run_due_reminders


def main(argv: list[str]) -> int:
    command = argv[:1]
    if command == ["run-reminders"]:
        with SessionLocal() as db:
            print(run_due_reminders(db))
        return 0
    if command == ["run-recalls"]:
        from app.services.recalls import run_jobs

        with SessionLocal() as db:
            print(run_jobs(db))
        return 0
    if command == ["run-leads"]:
        from app.services.leads import run_follow_up_alerts

        with SessionLocal() as db:
            print({"alerts": run_follow_up_alerts(db)})
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
