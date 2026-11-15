"""JWT and password security tests — HD-SEC-02/03/08."""
import pytest
from app.core.security import hash_password, verify_password, create_access_token, decode_token


def test_hash_is_not_plaintext():
    h = hash_password("mypassword123")
    assert h != "mypassword123"
    assert len(h) > 20


def test_verify_correct_password():
    h = hash_password("correct")
    assert verify_password("correct", h) is True


def test_verify_wrong_password():
    h = hash_password("correct")
    assert verify_password("wrong", h) is False


def test_two_hashes_differ():
    h1 = hash_password("same")
    h2 = hash_password("same")
    assert h1 != h2  # argon2 uses salt


def test_token_creation_and_decode():
    token = create_access_token("user-123", {"role": "BUYER"})
    payload = decode_token(token)
    assert payload["sub"] == "user-123"
    assert payload["role"] == "BUYER"


def test_token_has_iat():
    token = create_access_token("user-123")
    payload = decode_token(token)
    assert "iat" in payload


def test_token_has_exp():
    token = create_access_token("user-123")
    payload = decode_token(token)
    assert "exp" in payload


def test_tampered_token_rejected():
    from jose import JWTError
    token = create_access_token("user-123") + "tampered"
    with pytest.raises(JWTError):
        decode_token(token)
