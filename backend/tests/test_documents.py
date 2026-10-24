import base64
import io
import struct
import zlib

import pytest

from app.core.config import get_settings

API = "/api/v1"


@pytest.fixture(autouse=True)
def _uploads(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path))
    yield


def png(width=40, height=30) -> bytes:
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + bytes([(x * 7 + y) % 256 for x in range(width * 3)]) for y in range(height))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


def upload(client, h, patient="pat_1", data=None, name="xray.png", **fields):
    form = {"type": "X-Ray", "xrayKind": "IOPA", "teeth": "36,37", **fields}
    return client.post(f"{API}/patients/{patient}/documents", headers=h,
                       files={"file": (name, io.BytesIO(data if data is not None else png()), "image/png")}, data=form)


def test_upload_list_and_view_with_signed_link(client, as_role):
    h = as_role("dentist")
    res = upload(client, h, title="IOPA 36 pre-op")
    assert res.status_code == 201, res.text
    doc = res.json()
    assert doc["contentType"] == "image/png" and doc["teeth"] == ["36", "37"] and doc["isImage"]
    assert doc["fileUrl"].startswith("/documents/") and "s=" in doc["fileUrl"]

    listed = client.get(f"{API}/patients/pat_1/documents", headers=h, params={"tooth": "36"}).json()
    assert [d["id"] for d in listed] == [doc["id"]]

    # The signed link works without a login token, so <img> tags can use it.
    file = client.get(f"{API}{doc['fileUrl']}")
    assert file.status_code == 200 and file.content.startswith(b"\x89PNG") and file.headers["x-content-type-options"] == "nosniff"
    tampered = doc["fileUrl"].replace("s=", "s=x")
    assert client.get(f"{API}{tampered}").status_code == 403
    assert client.get(f"{API}/documents/{doc['id']}/download").status_code == 403


def test_file_type_is_checked_by_content(client, as_role):
    h = as_role("dentist")
    fake = upload(client, h, data=b"MZ\x90\x00 this is an exe", name="photo.png")
    assert fake.status_code == 415 and fake.json()["code"] == "UNSUPPORTED_FILE"
    pdf = upload(client, h, data=PDF, name="report.pdf", type="Lab Report", teeth="")
    assert pdf.status_code == 201 and pdf.json()["contentType"] == "application/pdf" and not pdf.json()["isImage"]
    bad_tooth = upload(client, h, teeth="99")
    assert bad_tooth.status_code == 400 and bad_tooth.json()["code"] == "INVALID_TOOTH"


def test_size_limit(client, as_role, monkeypatch):
    monkeypatch.setattr(get_settings(), "max_upload_mb", 0)
    res = upload(client, as_role("dentist"))
    assert res.status_code == 413


def test_patients_see_shared_documents_only(client, as_role):
    h = as_role("dentist")
    shared = upload(client, h).json()
    private = upload(client, h, sharedWithPatient="false", title="Internal note").json()
    p = as_role("patient")
    mine = [d["id"] for d in client.get(f"{API}/patients/pat_1/documents", headers=p).json()]
    assert shared["id"] in mine and private["id"] not in mine
    assert client.get(f"{API}/documents/{private['id']}", headers=p).status_code == 404
    assert client.get(f"{API}/patients/pat_2/documents", headers=p).status_code == 404

    # Patients may add insurance papers, not X-rays, and can only remove their own uploads.
    assert upload(client, p).status_code == 403
    mine_doc = upload(client, p, data=PDF, name="policy.pdf", type="Insurance Document", teeth="").json()
    assert mine_doc["uploadedByPatient"]
    assert client.delete(f"{API}/documents/{shared['id']}", headers=p).status_code == 403
    assert client.delete(f"{API}/documents/{mine_doc['id']}", headers=p).status_code == 204


def test_tags_annotations_and_soft_delete(client, as_role):
    h = as_role("dentist")
    doc = upload(client, h).json()
    res = client.patch(f"{API}/documents/{doc['id']}", headers=h, json={
        "tags": ["pre-op"], "notes": "Periapical radiolucency 36",
        "annotations": [{"kind": "circle", "x": 0.4, "y": 0.5, "r": 0.1, "text": "Lesion"}]})
    out = res.json()
    assert res.status_code == 200 and out["annotations"][0]["by"] == "Sarah Smith" and out["tags"] == ["pre-op"]
    off_image = client.patch(f"{API}/documents/{doc['id']}", headers=h, json={"annotations": [{"kind": "arrow", "x": 1.5, "y": 0}]})
    assert off_image.status_code == 422

    r = as_role("receptionist")
    assert client.delete(f"{API}/documents/{doc['id']}", headers=r).status_code == 403, "front desk can't remove X-rays"
    assert client.delete(f"{API}/documents/{doc['id']}", headers=h).status_code == 204
    assert client.get(f"{API}/documents/{doc['id']}", headers=h).status_code == 404
    assert client.get(f"{API}{doc['fileUrl']}").status_code == 404


def test_other_clinic_cannot_see(client, as_role):
    doc = upload(client, as_role("dentist")).json()
    assert client.get(f"{API}/documents/{doc['id']}", headers=as_role("admin")).status_code == 404
