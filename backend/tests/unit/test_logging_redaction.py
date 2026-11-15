"""HD-SEC-09: logging must redact passwords and tokens."""
from app.core.logging import _redact


def test_password_field_redacted():
    msg = '{"email": "buyer@anl.dev", "password": "secret123"}'
    result = _redact(msg)
    assert "secret123" not in result
    assert "[REDACTED]" in result


def test_access_token_redacted():
    msg = '{"access_token": "eyJhbGciOiJIUzI1NiJ9.payload.sig"}'
    result = _redact(msg)
    assert "eyJhbGciOiJIUzI1NiJ9" not in result


def test_bearer_token_redacted():
    msg = "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig"
    result = _redact(msg)
    assert "eyJhbGciOiJIUzI1NiJ9" not in result


def test_non_sensitive_not_redacted():
    msg = '{"rfq_id": "abc123", "outcome": "ACCEPTED"}'
    result = _redact(msg)
    assert "abc123" in result
    assert "ACCEPTED" in result


def test_empty_string_safe():
    assert _redact("") == ""


def test_no_sensitive_data_unchanged():
    msg = "user=buyer@anl.dev outcome=LOGIN_SUCCESS latency=120ms"
    assert _redact(msg) == msg
