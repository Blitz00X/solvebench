from solution import add

cases = [(1, 2, 3), (-2, 5, 3), (0, 0, 0)]
for a, b, expected in cases:
    actual = add(a, b)
    assert actual == expected, f"add({a}, {b}): expected {expected}, got {actual}"
print(f"{len(cases)} passed")
