"""HD-SEC-05: anon label assignment is random permutation, stable per supplier."""
import uuid
from app.services.rfq_service import _assign_anon_labels


def test_one_supplier():
    s = [uuid.uuid4()]
    labels = _assign_anon_labels(s)
    assert set(labels.values()) == {"Supplier 1"}


def test_three_suppliers_unique_labels():
    ids = [uuid.uuid4() for _ in range(3)]
    labels = _assign_anon_labels(ids)
    assert len(set(labels.values())) == 3
    assert set(labels.values()) == {"Supplier 1", "Supplier 2", "Supplier 3"}


def test_labels_are_random_permutation():
    """Running many times should produce different orderings."""
    ids = [uuid.uuid4() for _ in range(5)]
    results = set()
    for _ in range(50):
        labels = _assign_anon_labels(ids)
        results.add(tuple(labels[i] for i in ids))
    # With 5 suppliers and 50 trials, probability of always same order is (1/120)^49 ≈ 0
    assert len(results) > 1


def test_labels_cover_1_to_n():
    ids = [uuid.uuid4() for _ in range(4)]
    labels = _assign_anon_labels(ids)
    nums = {int(v.split(" ")[1]) for v in labels.values()}
    assert nums == {1, 2, 3, 4}
