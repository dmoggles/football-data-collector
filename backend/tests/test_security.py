from app.services.security import hash_password


def test_hash_password_not_equal_input() -> None:
    password = "Password123!"
    hashed = hash_password(password)

    assert hashed != password
    assert len(hashed) > 20
