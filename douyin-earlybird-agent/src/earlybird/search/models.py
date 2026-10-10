from dataclasses import asdict, dataclass, field
from typing import Any

@dataclass
class Candidate:
    query: str
    source: str = "douyin_app"
    title: str | None = None
    author: str | None = None
    publish_text: str | None = None
    description: str | None = None
    aweme_id: str | None = None
    share_url: str | None = None
    visible_text: str = ""
    position: int = 0
    first_seen_at: str | None = None
    last_seen_at: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)

    def identity(self) -> tuple[str | None, str]:
        if self.aweme_id:
            return self.aweme_id, "aweme_id"
        if self.share_url:
            return self.share_url, "share_url"
        import hashlib
        fields = ((self.title or "").strip().lower(), (self.author or "").strip().lower(), (self.publish_text or "").strip().lower())
        if not any(fields):
            if not self.visible_text.strip():
                return None, "UNIDENTIFIABLE"
            normalized = "visible_text|" + self.visible_text.strip().lower()
        else:
            normalized = "|".join(fields)
        return hashlib.sha256(normalized.encode()).hexdigest(), "fingerprint"

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)
