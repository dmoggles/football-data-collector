import argparse
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create or update a super admin account.")
    parser.add_argument("--email", required=True, help="User email")
    parser.add_argument("--password", required=True, help="User password")
    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="Reset password if the user already exists",
    )
    return parser.parse_args()


def main() -> None:
    current_dir = Path(__file__).resolve().parent
    backend_dir = current_dir.parent
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    from sqlalchemy import select

    from app.db.session import SessionLocal
    from app.models.global_role import GlobalRole, GlobalRoleType
    from app.models.user import User
    from app.services.security import hash_password

    args = parse_args()
    normalized_email = args.email.strip().lower()

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == normalized_email))
        if user is None:
            user = User(email=normalized_email, password_hash=hash_password(args.password))
            db.add(user)
            db.flush()
            print(f"Created user: {normalized_email}")
        elif args.reset_password:
            user.password_hash = hash_password(args.password)
            print(f"Updated password for: {normalized_email}")
        else:
            print(f"User already exists: {normalized_email}")

        role = db.scalar(
            select(GlobalRole).where(
                GlobalRole.user_id == user.id,
                GlobalRole.role == GlobalRoleType.SUPER_ADMIN.value,
            )
        )
        if role is None:
            db.add(GlobalRole(user_id=user.id, role=GlobalRoleType.SUPER_ADMIN.value))
            print("Granted role: super_admin")
        else:
            print("Role already present: super_admin")

        db.commit()
        print(f"Super admin ready: {normalized_email}")


if __name__ == "__main__":
    main()
