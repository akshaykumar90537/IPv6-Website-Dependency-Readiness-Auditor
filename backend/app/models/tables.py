from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class Scan(Base):
    __tablename__ = "scan"
    scan_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    target_url: Mapped[str] = mapped_column(Text)
    final_url: Mapped[str | None] = mapped_column(Text, default=None)
    # QUEUED | RUNNING | COMPLETED | PARTIAL | BLOCKED | SCAN_FAILED
    status: Mapped[str] = mapped_column(String(20), default="QUEUED")
    error: Mapped[str | None] = mapped_column(Text, default=None)
    scanner_version: Mapped[str] = mapped_column(String(16))
    batch_id: Mapped[str | None] = mapped_column(String(32), default=None)
    truncated: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(String(32), default=utcnow)
    started_at: Mapped[str | None] = mapped_column(String(32), default=None)
    finished_at: Mapped[str | None] = mapped_column(String(32), default=None)
    summary: Mapped[dict | None] = mapped_column(JSON, default=None)


class Resource(Base):
    __tablename__ = "resource"
    scan_id: Mapped[str] = mapped_column(ForeignKey("scan.scan_id"), primary_key=True)
    resource_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    parent_resource_id: Mapped[str | None] = mapped_column(String(16), default=None)
    parent_inferred: Mapped[bool] = mapped_column(Boolean, default=False)
    url: Mapped[str] = mapped_column(Text)
    hostname: Mapped[str] = mapped_column(String(255), index=True)
    port: Mapped[int] = mapped_column(Integer)
    scheme: Mapped[str] = mapped_column(String(8))
    resource_type: Mapped[str] = mapped_column(String(16))
    initiator: Mapped[str] = mapped_column(String(24))
    initiator_url: Mapped[str | None] = mapped_column(Text, default=None)
    protocol: Mapped[str | None] = mapped_column(String(16), default=None)
    http_status: Mapped[int | None] = mapped_column(Integer, default=None)
    load_status: Mapped[str] = mapped_column(String(12))
    error_text: Mapped[str | None] = mapped_column(Text, default=None)
    remote_ip: Mapped[str | None] = mapped_column(String(64), default=None)
    remote_family: Mapped[int | None] = mapped_column(Integer, default=None)
    timestamp: Mapped[str | None] = mapped_column(String(32), default=None)
    ipv4_addresses: Mapped[list] = mapped_column(JSON, default=list)
    ipv6_addresses: Mapped[list] = mapped_column(JSON, default=list)


class MeasurementContext(Base):
    """How/where the scan was measured. Separate from findings; NULL means Unknown."""
    __tablename__ = "measurement_context"
    scan_id: Mapped[str] = mapped_column(ForeignKey("scan.scan_id"), primary_key=True)
    collected_at: Mapped[str] = mapped_column(String(32))
    resolver_ips: Mapped[list] = mapped_column(JSON, default=list)
    resolver_upstream_ips: Mapped[list] = mapped_column(JSON, default=list)
    resolver_source: Mapped[str | None] = mapped_column(String(64), default=None)
    resolver_is_local_stub: Mapped[bool | None] = mapped_column(Boolean, default=None)
    resolver_egress_ip: Mapped[str | None] = mapped_column(String(64), default=None)
    scanner_public_ipv4: Mapped[str | None] = mapped_column(String(64), default=None)
    scanner_public_ipv6: Mapped[str | None] = mapped_column(String(64), default=None)
    ipv4_egress_ok: Mapped[bool | None] = mapped_column(Boolean, default=None)
    ipv6_egress_ok: Mapped[bool | None] = mapped_column(Boolean, default=None)
    geo_ip: Mapped[str | None] = mapped_column(String(64), default=None)
    geo_country: Mapped[str | None] = mapped_column(String(64), default=None)
    geo_region: Mapped[str | None] = mapped_column(String(128), default=None)
    geo_city: Mapped[str | None] = mapped_column(String(128), default=None)
    geo_org: Mapped[str | None] = mapped_column(String(255), default=None)
    geo_source: Mapped[str | None] = mapped_column(String(32), default=None)
    warnings: Mapped[list] = mapped_column(JSON, default=list)


class HostProbe(Base):
    """One row per (host, port, address family). Phase 2 fills DNS; Phase 3 fills the rest."""
    __tablename__ = "host_probe"
    scan_id: Mapped[str] = mapped_column(ForeignKey("scan.scan_id"), primary_key=True)
    hostname: Mapped[str] = mapped_column(String(255), primary_key=True)
    port: Mapped[int] = mapped_column(Integer, primary_key=True)
    family: Mapped[int] = mapped_column(Integer, primary_key=True)  # 4 or 6
    dns_status: Mapped[str] = mapped_column(String(20), default="NOT_TESTED")
    dns_addresses: Mapped[list] = mapped_column(JSON, default=list)
    dns_detail: Mapped[str | None] = mapped_column(Text, default=None)
    canonical_name: Mapped[str | None] = mapped_column(String(255), default=None)
    resolver_used: Mapped[str | None] = mapped_column(String(64), default=None)
    dns_ms: Mapped[int | None] = mapped_column(Integer, default=None)
    tcp_status: Mapped[str] = mapped_column(String(20), default="NOT_TESTED")
    tls_status: Mapped[str] = mapped_column(String(20), default="NOT_TESTED")
    http_stage_status: Mapped[str] = mapped_column(String(20), default="NOT_TESTED")
    http_code: Mapped[int | None] = mapped_column(Integer, default=None)
    failure_stage: Mapped[str | None] = mapped_column(String(12), default=None)
    failure_subtype: Mapped[str | None] = mapped_column(String(32), default=None)
    latency_ms: Mapped[int | None] = mapped_column(Integer, default=None)
    error_detail: Mapped[str | None] = mapped_column(Text, default=None)
    # --- Phase 3 ---
    probe_scheme: Mapped[str | None] = mapped_column(String(8), default=None)
    probe_path: Mapped[str | None] = mapped_column(Text, default=None)
    verdict: Mapped[str | None] = mapped_column(String(20), default=None)
    family_comparison: Mapped[str | None] = mapped_column(String(20), default=None)
    connected_address: Mapped[str | None] = mapped_column(String(64), default=None)
    addresses_tested: Mapped[int] = mapped_column(Integer, default=0)
    addresses_reachable: Mapped[int] = mapped_column(Integer, default=0)
    tcp_ms: Mapped[int | None] = mapped_column(Integer, default=None)
    tls_ms: Mapped[int | None] = mapped_column(Integer, default=None)
    http_ms: Mapped[int | None] = mapped_column(Integer, default=None)
    tls_version: Mapped[str | None] = mapped_column(String(16), default=None)


class Batch(Base):
    """A 30-site (or custom) run. Per-site progress/status is derived by joining
    BatchSite -> Scan at query time, never cached here, so concurrent site completions
    can't race on a shared read-modify-write JSON blob (a mistake avoided on purpose -
    see docs/decisions.md Phase 6 notes)."""
    __tablename__ = "batch"
    batch_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    status: Mapped[str] = mapped_column(String(20), default="QUEUED")  # QUEUED | RUNNING | COMPLETED
    total: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(32), default="default")  # "default" | "custom"
    scanner_version: Mapped[str] = mapped_column(String(16))
    error: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[str] = mapped_column(String(32), default=utcnow)
    started_at: Mapped[str | None] = mapped_column(String(32), default=None)
    finished_at: Mapped[str | None] = mapped_column(String(32), default=None)


class BatchSite(Base):
    """One planned site within a batch. Written once, up front, before any scanning
    starts; never updated afterwards. Its live status comes from joining to Scan via
    scan_id. site_index preserves input order and lets duplicate URLs coexist as
    distinct rows (each gets its own scan_id)."""
    __tablename__ = "batch_site"
    batch_id: Mapped[str] = mapped_column(ForeignKey("batch.batch_id"), primary_key=True)
    site_index: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    url: Mapped[str] = mapped_column(Text)
    scan_id: Mapped[str] = mapped_column(String(32))
