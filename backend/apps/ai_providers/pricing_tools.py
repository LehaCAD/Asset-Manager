from __future__ import annotations

import json
from itertools import product
from typing import Any


def generate_pricing_template(dimensions: list[str], value_map: dict[str, list[Any]]) -> dict[str, Any]:
    costs: dict[str, str] = {}
    value_lists = [value_map.get(dimension, []) for dimension in dimensions]
    for combination in product(*value_lists):
        key = "|".join(str(value) for value in combination)
        costs[key] = ""
    return {
        "cost_params": dimensions,
        "costs": costs,
    }


def parse_bulk_pricing_json(
    raw_json: str,
    *,
    dimensions: list[str],
    allowed_values: dict[str, list[Any]] | None = None,
) -> dict[str, Any]:
    payload = json.loads(raw_json)
    if not isinstance(payload, dict):
        raise ValueError('Pricing payload должен быть JSON-объектом.')

    cost_params = payload.get("cost_params")
    costs = payload.get("costs")
    if cost_params != dimensions or not isinstance(costs, dict):
        raise ValueError('Bulk pricing JSON должен содержать cost_params и costs в ожидаемом формате.')

    allowed_values = allowed_values or {}
    normalized_allowed = {
        key: {str(value) for value in values}
        for key, values in allowed_values.items()
    }

    for lookup_key in costs.keys():
        parts = lookup_key.split("|")
        if len(parts) != len(dimensions):
            raise ValueError(f'Некорректный ключ pricing lookup: "{lookup_key}".')

        for dimension, part in zip(dimensions, parts):
            allowed = normalized_allowed.get(dimension)
            if allowed and part not in allowed:
                raise ValueError(f'Недопустимое значение "{part}" для dimension "{dimension}".')

    return payload
