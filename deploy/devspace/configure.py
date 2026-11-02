"""Create private runtime settings; never replace an existing env file."""
import argparse
import os
from pathlib import Path
import secrets


def configure(target):
    template = Path(__file__).with_name("env.example").read_text()
    names = {"SECRET_KEY", "LIVE_SERVER_SECRET_KEY", "POSTGRES_PASSWORD", "RABBITMQ_PASSWORD", "AWS_SECRET_ACCESS_KEY"}
    template = "\n".join(
        f"{line.split('=', 1)[0]}={secrets.token_hex(32)}" if line.split('=', 1)[0] in names else line
        for line in template.splitlines()
    ) + "\n"
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as stream:
        stream.write(template)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("devspace.env"))
    args = parser.parse_args()
    configure(args.output)
    print("Created runtime env file; secrets are not printed. Keep it private and backed up.")
