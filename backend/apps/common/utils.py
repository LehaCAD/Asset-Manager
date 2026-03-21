"""Shared utility functions."""


def format_storage(size_bytes: int) -> str:
    """Format bytes into human-readable Russian string."""
    if size_bytes < 1024:
        return f"{size_bytes} Б"
    elif size_bytes < 1024 ** 2:
        return f"{size_bytes / 1024:.1f} КБ"
    elif size_bytes < 1024 ** 3:
        return f"{size_bytes / 1024 ** 2:.1f} МБ"
    else:
        return f"{size_bytes / 1024 ** 3:.1f} ГБ"
