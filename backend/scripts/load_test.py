#!/usr/bin/env python3
"""
HD-RT-10: Bid API load test.
Usage:
    python scripts/load_test.py --host http://localhost:8000 --rfq <rfq_id> --concurrency 50

Measures p50/p95/p99 latency for POST /bids with concurrent suppliers.
"""
import argparse
import asyncio
import json
import statistics
import time
import uuid
from datetime import date

import httpx


async def login(client: httpx.AsyncClient, host: str, email: str, password: str) -> str:
    r = await client.post(f"{host}/api/v1/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]


async def submit_bid(client: httpx.AsyncClient, host: str, token: str, rfq_id: str, total: str) -> tuple[int, float]:
    """Returns (status_code, latency_ms)."""
    idem_key = str(uuid.uuid4())
    # Split total roughly into three charges
    from decimal import Decimal
    t = Decimal(total)
    f = (t * Decimal("0.5")).quantize(Decimal("0.01"))
    o = (t * Decimal("0.3")).quantize(Decimal("0.01"))
    d = t - f - o

    t0 = time.monotonic()
    r = await client.post(
        f"{host}/api/v1/rfqs/{rfq_id}/bids",
        json={
            "freight_charge": str(f),
            "origin_charge": str(o),
            "destination_charge": str(d),
            "transit_time_days": 3,
            "valid_until": str(date.today().replace(year=date.today().year + 1)),
        },
        headers={
            "Authorization": f"Bearer {token}",
            "Idempotency-Key": idem_key,
        },
    )
    latency = (time.monotonic() - t0) * 1000
    return r.status_code, latency


async def run_load_test(host: str, rfq_id: str, concurrency: int, requests_per_supplier: int):
    # Use demo suppliers
    credentials = [
        ("supplier1@anl.dev", "password123"),
        ("supplier2@anl.dev", "password123"),
        ("supplier3@anl.dev", "password123"),
    ]

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Login
        tokens = []
        for email, pw in credentials[:concurrency]:
            try:
                token = await login(client, host, email, pw)
                tokens.append(token)
            except Exception as e:
                print(f"Login failed for {email}: {e}")

        if not tokens:
            print("No tokens — check credentials and server.")
            return

        latencies: list[float] = []
        statuses: dict[int, int] = {}

        async def run_supplier(token: str, start_total: float):
            for i in range(requests_per_supplier):
                total = f"{max(1, start_total - i * 10):.2f}"
                try:
                    status, lat = await submit_bid(client, host, token, rfq_id, total)
                    latencies.append(lat)
                    statuses[status] = statuses.get(status, 0) + 1
                except Exception as e:
                    statuses[500] = statuses.get(500, 0) + 1

        tasks = [
            run_supplier(tokens[i % len(tokens)], 1000.00 - (i * 5))
            for i in range(concurrency)
        ]
        t0 = time.monotonic()
        await asyncio.gather(*tasks)
        total_time = time.monotonic() - t0

    if not latencies:
        print("No latency data recorded.")
        return

    latencies.sort()
    n = len(latencies)
    p50 = latencies[int(n * 0.50)]
    p95 = latencies[int(n * 0.95)]
    p99 = latencies[int(n * 0.99)]
    mean = statistics.mean(latencies)

    print(f"\nLoad test results ({n} requests in {total_time:.1f}s)")
    print(f"  RPS: {n / total_time:.1f}")
    print(f"  p50: {p50:.0f}ms  p95: {p95:.0f}ms  p99: {p99:.0f}ms  mean: {mean:.0f}ms")
    print(f"  Status codes: {dict(sorted(statuses.items()))}")
    print(f"\n  Target: p95 < 500ms (SRS) | p99 < 800ms (HD-RT-10)")
    print(f"  {'PASS' if p95 < 500 else 'FAIL'}: p95 = {p95:.0f}ms")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="http://localhost:8000")
    parser.add_argument("--rfq", required=True, help="RFQ UUID")
    parser.add_argument("--concurrency", type=int, default=50)
    parser.add_argument("--requests", type=int, default=5, help="Requests per supplier")
    args = parser.parse_args()
    asyncio.run(run_load_test(args.host, args.rfq, args.concurrency, args.requests))
