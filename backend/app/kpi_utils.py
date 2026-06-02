from collections.abc import Iterable

KPI_STATUS_ORDER = ["exceeded", "above_98", "above_68", "above_50", "below_50", "not_entered"]

KPI_STATUS_LABELS = {
    "not_entered": "Chưa đánh giá",
    "exceeded": "Đạt và vượt",
    "above_98": "Đạt trên 98%",
    "above_68": "Đạt trên 68%",
    "above_50": "Đạt trên 50%",
    "below_50": "Đạt dưới 50%",
}

KPI_REPORT_LABELS = {
    "exceeded": "đạt và vượt",
    "above_98": "đạt trên 98%",
    "above_68": "đạt trên 68%",
    "above_50": "đạt trên 50%",
    "below_50": "đạt dưới 50%",
    "not_entered": "chưa đánh giá",
}


def classify_kpi_status(percentage: float | None) -> str:
    if percentage is None:
        return "not_entered"
    if percentage >= 100:
        return "exceeded"
    if percentage >= 98:
        return "above_98"
    if percentage >= 68:
        return "above_68"
    if percentage >= 50:
        return "above_50"
    return "below_50"


def format_percentage(value: float | None) -> str:
    if value is None:
        return "chưa nhập"
    text = f"{value:.2f}".rstrip("0").rstrip(".").replace(".", ",")
    return f"đạt {text}%"


def build_kpi_report_text(period_name: str, rows: Iterable[dict]) -> str:
    grouped = {status: [] for status in KPI_STATUS_ORDER}
    total = 0
    for row in rows:
        total += 1
        grouped.setdefault(row["status"], []).append(row)

    lines = [
        f"Kết quả lãnh đạo, chỉ đạo thực hiện các chỉ tiêu Nghị quyết của Đảng uỷ xã {period_name.lower()}, cụ thể như sau:"
    ]
    for status in KPI_STATUS_ORDER:
        items = grouped.get(status, [])
        if not items:
            continue
        label = KPI_REPORT_LABELS[status]
        if status == "not_entered":
            lines.append(f"- {len(items):02d} chỉ tiêu {label}:")
        elif len(items) == 1:
            item = items[0]
            lines.append(f"- {len(items):02d} chỉ tiêu {label}: {format_report_item(item, status, inline=True)}")
            continue
        else:
            lines.append(f"- Có {len(items):02d}/{total} chỉ tiêu {label}:")
        for item in items:
            lines.append(f"+ {format_report_item(item, status)}")
    return "\n".join(lines)


def format_report_item(item: dict, status: str, inline: bool = False) -> str:
    indicator = item["indicator"]
    note = (item.get("note") or "").strip()
    if status == "not_entered":
        detail = note or indicator.get("description") or "Chưa có nội dung đánh giá"
        return f"Chỉ tiêu số {indicator['number']}: {indicator['name']} ({detail})."
    detail = note or format_percentage(item.get("percentage"))
    prefix = f"Chỉ tiêu số {indicator['number']}"
    if inline:
        return f"{prefix} về {indicator['name'].lower()} ({detail})."
    return f"{prefix} về {indicator['name'].lower()} ({detail})."
